"""Ephemeral stations on the existing GPU lane. Never writes to Store or Library."""
from __future__ import annotations
import collections, hashlib, json, re, secrets, shutil, subprocess, sys, threading, time
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Literal
from fastapi import HTTPException
from fastapi.responses import FileResponse
from .schema import Generation, JobRequest
from .model_runtime import check_downloads
from .radio_language import RadioLanguage, LANGUAGES, resolve_language, language_direction, lyric_units


class StationSettings(BaseModel):
    description: str = Field(min_length=3, max_length=2000)
    model: str = 'Qwen/Qwen3-4B'
    vocals: Literal['auto', 'female', 'male', 'duet', 'instrumental'] = 'auto'
    quality: Literal['balanced', 'high'] = 'balanced'
    length: Literal['standard', 'long'] = 'long'
    language: RadioLanguage = 'auto'


class StationRequest(StationSettings):
    approvedDownloads: list[str] = Field(default_factory=list, max_length=16)


class StationDirection(BaseModel):
    description: str = Field(min_length=3, max_length=2000)
    language: RadioLanguage = 'auto'
    revision: int = Field(ge=1)
    vocals: Literal['auto', 'female', 'male', 'duet', 'instrumental'] | None = None
    model: str | None = Field(default=None,max_length=200)
    quality: Literal['balanced','high'] | None = None
    length: Literal['standard','long'] | None = None
    approvedDownloads: list[str] = Field(default_factory=list,max_length=16)


# Composition targets, not cropping or looped audio. YuE2 decides the final duration.
LENGTH_DIRECTION = {
    'standard': 'Aim for about 3 minutes: 16 to 24 lyric lines with two verses, a recurring chorus and a resolved ending.',
    'long': 'Aim for about 5 minutes: 32 to 44 lyric lines with three developed verses, recurring choruses, a contrasting bridge, a final chorus and a resolved outro. Write out every repeated chorus in full.',
}


from .music_adapters import resolve_vocals


def hit_generation_limit(value):
    return any(bool(v) for v in value.values()) if isinstance(value, dict) else bool(value)


def memory_error(exc):
    return any(term in str(exc).lower() for term in ('out of memory', 'memory exhausted'))


def parse_song(text, recent):
    text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip())
    try:
        if text.startswith('{'):
            data = json.loads(text, strict=False)
        else:
            match = re.fullmatch(r'TITLE:\s*(.*?)\nSTYLE:\s*(.*?)\nLYRICS:\s*(.*)', text, flags=re.S|re.I)
            if not match: raise ValueError('Missing song fields')
            data = dict(zip(('title','style','lyrics'),match.groups()))
    except (ValueError, TypeError):
        raise ValueError('The writer returned an incomplete song. Try again.')
    if not isinstance(data, dict): raise ValueError('The writer returned an invalid song')
    for key, limit in (('title', 120), ('style', 1200), ('lyrics', 6000)):
        if not isinstance(data.get(key), str) or not data[key].strip() or len(data[key]) > limit:
            raise ValueError('The writer returned an invalid ' + key)
        data[key] = data[key].strip()
    data['title'] = data['title'].strip('\"“”')
    units=lyric_units(data['lyrics'])
    if len(units) < 24: raise ValueError('The writer returned too few lyrics')
    words = set(units)
    for old in recent:
        other = set(lyric_units(old['lyrics']))
        if data['title'].casefold() == old['title'].casefold() or len(words & other) / max(1, len(words | other)) > .72:
            raise ValueError('The writer repeated a recent song. Try again for a fresh song.')
    return {k: data[k] for k in ('title', 'style', 'lyrics')}


class Radio:
    CROSSFADE = 4.0
    def __init__(self, worker):
        self.worker = worker
        self.root = worker.store.root / 'temp' / 'radio'
        self.lock = threading.RLock()
        self.session = None
        self.thread = None
        self.closing = threading.Event()
        self.garbage = set()
        self.writer_process = None
        self.writer_log = None

    def remove(self, path):
        path = Path(path).resolve()
        if not path.is_relative_to(self.root.resolve()) or path == self.root.resolve():
            raise ValueError('Invalid radio cleanup path')
        try:
            if path.is_symlink(): path.unlink()
            elif path.exists(): shutil.rmtree(path)
            self.garbage.discard(path)
        except OSError:
            self.garbage.add(path)  # Windows may still have an audio response open.

    def start(self):
        # Called only after the workstation worker lease has been acquired.
        self.root.mkdir(parents=True, exist_ok=True)
        for p in self.root.iterdir():
            if p.is_dir() and re.fullmatch(r'[a-f0-9]{32}', p.name): self.remove(p)
        self.thread = threading.Thread(target=self.sweep, daemon=True)
        self.thread.start()

    def sweep(self):
        while not self.closing.wait(.5):
            with self.lock:
                if self.session: self.advance_clock(self.session)
                for p in list(self.garbage): self.remove(p)

    def advance_clock(self, s, now=None):
        now=time.time() if now is None else now
        tracks=s['tracks']
        if not tracks:return
        if tracks[0].get('startedAt') is None:
            tracks[0]['startedAt']=now
            s['listening']=True
        end=tracks[0]['startedAt']+tracks[0]['duration']
        if len(tracks)>1 and tracks[1].get('startedAt') is None and now>=end-self.CROSSFADE:
            tracks[1]['startedAt']=max(end-self.CROSSFADE,now)
        if now>=end:
            old=tracks.pop(0)
            self.remove(self.root/s['id']/old['id'])
            if tracks and tracks[0].get('startedAt') is None:tracks[0]['startedAt']=now
            if not s['active'] and not s['error']:s.update(state='Queued',message='Preparing the next song',progress=None)
            self.worker.wake.set()

    def current(self):
        with self.lock:return self.snapshot(self.session['id']) if self.session else None

    def release_writer(self):
        with self.lock:
            self.worker.terminate(self.writer_process)
            self.writer_process=None
            if self.writer_log:self.writer_log.close();self.writer_log=None

    def close(self):
        self.closing.set()
        if self.thread: self.thread.join(6)
        with self.lock:
            if self.session: self.stop(self.session['id'])
            self.release_writer()
            for p in list(self.garbage): self.remove(p)

    def create(self, request, verify=True):
        request.description = request.description.strip()
        if len(request.description) < 3: raise ValueError('Describe the music for your station')
        if verify:
            from .providers import capabilities, text_model
            if not capabilities()['text']['available']:
                raise ValueError('Radio needs the Runpod GPU and lyric assistant runtime. Open your GPU workstation to start a station.')
            text_model(request.model)
            for kind in ('lyrics', 'generate'):
                check_downloads(self.worker.store.root, None, JobRequest(projectId='radio', kind=kind, options={'model': request.model}, generation=Generation(style=request.description,role=request.vocals), approvedDownloads=request.approvedDownloads))
        with self.lock:
            if self.session: raise HTTPException(409, 'A station is already open on this workstation. Open Radio to join it, or stop the live station before starting another.')
            sid = secrets.token_hex(16)
            self.session = dict(id=sid, request=request, tracks=[], recent=collections.deque(maxlen=12), count=0,
                                revision=1, active=False, cancelled=False, listening=False, cacheBlocked=False, state='Queued', message='Waiting for the GPU', progress=None, error=None)
            (self.root/sid).mkdir(parents=True, exist_ok=True)
            self.worker.wake.set()
            return self.snapshot(sid)

    def get(self, sid):
        if not self.session or self.session['id'] != sid: raise KeyError('Station ended. Start a new station.')
        return self.session

    def snapshot(self, sid):
        with self.lock:
            s = self.get(sid)
            return {k:s[k] for k in ('id','state','message','progress','error','count')} | {'tracks':[dict(t) for t in s['tracks']], 'description':s['request'].description,'length':s['request'].length,'settings':s['request'].model_dump(exclude={'approvedDownloads'}),'directionState':('live' if s['tracks'] and s['tracks'][0].get('directionRevision',1)==s['revision'] else 'ready' if any(t.get('directionRevision',1)==s['revision'] for t in s['tracks']) else 'preparing'),'serverTime':time.time(),'crossfadeSeconds':self.CROSSFADE,'modelResidency':s.get('modelResidency','Managed GPU cache'),'revision':s['revision'],'vocals':s['request'].vocals,'effectiveVocals':resolve_vocals(s['request'].vocals,s['request'].description),'language':s['request'].language,'effectiveLanguage':resolve_language(s['request'].language,s['request'].description),'pendingDirection':s['revision']>1 and (not s['tracks'] or s['tracks'][0].get('directionRevision',1)!=s['revision'])}

    def retune(self, sid, direction):
        description=direction.description.strip()
        if len(description)<3:raise ValueError('Describe the music for your station')
        with self.lock:
            s=self.get(sid)
            changes={'description':description,'language':direction.language}
            changes.update({key:getattr(direction,key) for key in ('vocals','model','quality','length') if getattr(direction,key) is not None})
            same=all(getattr(s['request'],key)==value for key,value in changes.items())
            if same:return self.snapshot(sid)  # Safe replay after a lost response.
            if direction.revision!=s['revision']:raise HTTPException(409,'The station direction changed in another tab. Review the current direction before applying yours.')
            if changes.get('model',s['request'].model)!=s['request'].model:
                from .providers import text_model
                text_model(changes['model'])
                check_downloads(self.worker.store.root,None,JobRequest(projectId='radio',kind='lyrics',options={'model':changes['model']},approvedDownloads=direction.approvedDownloads))
            proposed=s['request'].model_copy(update=changes)
            approved=list(dict.fromkeys(s['request'].approvedDownloads+direction.approvedDownloads))
            check_downloads(self.worker.store.root,None,JobRequest(projectId='radio',kind='generate',generation=Generation(style=proposed.description,role=proposed.vocals),approvedDownloads=approved))
            changes['approvedDownloads']=list(dict.fromkeys(s['request'].approvedDownloads+direction.approvedDownloads))
            s['request']=s['request'].model_copy(update=changes)
            s['revision']+=1
            s.update(error=None,state='Queued',message='Preparing your new direction',progress=None)
            # The serial GPU worker still owns this session until generate exits.
            # Stop only the subprocess doing the obsolete Radio task, not cached
            # idle models or any Creation/export process.
            process=s.get('activeProcess')
            if s['active'] and process is not None:
                if s.get('activeKind')=='writer' and process is self.writer_process:self.release_writer()
                elif s.get('activeKind')=='music' and process is self.worker.process:self.worker.kill()

            self.worker.wake.set()
            return self.snapshot(sid)

    def generation_request(self, s):
        return s.get('generationRequest',s['request'])

    def stop(self, sid):
        with self.lock:
            s = self.get(sid)
            s['cancelled'] = True
            # Set cancellation before terminating. No new process can start under this lock.
            if s['active']: self.worker.kill()
            self.release_writer()
            if not s['active']: self.remove(self.root/sid)
            self.session = None
        return {'ok':True}

    def retry(self, sid):
        with self.lock:
            s = self.get(sid)
            if s['error']: s.update(error=None,state='Queued',message='Trying a fresh song',progress=None)
            self.worker.wake.set()
            return self.snapshot(sid)

    def take(self):
        with self.lock:
            s = self.session
            if not s or s['active'] or s['error'] or (s['count']>0 and not s['listening']): return None
            needs_direction=not any(t.get('directionRevision',1)==s['revision'] for t in s['tracks'])
            if len(s['tracks'])>=2 and not needs_direction:return None
            s['generationRequest']=s['request'].model_copy(deep=True)
            s['generationRevision']=s['revision']
            s.update(active=True,state='Writing',message='Writing an original song for your station',progress=None)
            return s

    def update(self, s, **event):
        with self.lock:
            if s['cancelled'] or self.worker.stopping.is_set() or s.get('generationRevision',s['revision'])!=s['revision']: raise InterruptedError()
            if event.get('state',s['state']) != s['state'] and 'progress' not in event: s['progress']=None
            s.update({k:v for k,v in event.items() if k in ('state','message','progress')})
            self.worker.status.update(stage='Radio · '+s['state'])

    def write_song(self,s,directory,seed):
        from .gpu import gpu_status
        request=self.generation_request(s)
        devices=gpu_status().get('devices',[])
        device=devices[0] if devices else {}
        music_live=self.worker.process is not None and self.worker.process.poll() is None
        writer_live=self.writer_process is not None and self.writer_process.poll() is None
        small=request.model in ('Qwen/Qwen3-1.7B','Qwen/Qwen3-4B')
        free=device.get('totalBytes',0)-device.get('usedBytes',0)
        reserve=(10.5 if music_live else 19)*2**30
        coexist=not s['cacheBlocked'] and small and device.get('totalBytes',0)>=23*2**30 and (writer_live or free>=reserve)
        with self.lock:
            self.update(s)
            if not coexist:self.worker.kill()
            if not writer_live:
                self.release_writer()
                self.writer_log=open(self.root/s['id']/'writer.log','w',encoding='utf-8')
                self.writer_process=subprocess.Popen([sys.executable,'-u','-m','backend.radio_writer'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.writer_log,text=True,encoding='utf-8',cwd=str(Path(__file__).resolve().parent.parent))
            process=self.writer_process
            s.update(activeProcess=process,activeKind='writer')
            process.stdin.write(json.dumps({'root':str(self.worker.store.root),'request':request.model_dump(),'recent':list(s['recent']),'seed':seed})+'\n');process.stdin.flush()
        song=None
        for line in process.stdout:
            event=json.loads(line)
            if event.get('error'):raise RuntimeError(event['error'])
            if event.get('song'):song=event['song']
            self.update(s,**event)
            if event.get('done'):break
        with self.lock:
            self.update(s)
            s.update(activeProcess=None,activeKind=None)
        if song is None:raise RuntimeError('The radio writer stopped before finishing. Retry the station.')
        # Recheck real free device memory before loading music alongside the writer.
        devices=gpu_status().get('devices',[])
        remaining=(devices[0]['totalBytes']-devices[0]['usedBytes']) if devices else 0
        if not coexist or (not music_live and remaining<11*2**30):
            self.release_writer();s['modelResidency']='Models alternate to fit available VRAM'
        else:s['modelResidency']='Lyric writer cached; YuE2 engine stays loaded'
        return parse_song(json.dumps(song),s['recent'])

    def render_song(self,s,directory,gen,seed):
        for attempt in range(2):
            try:
                with self.lock:
                    self.update(s,state='Preparing',message='Preparing YuE2 for your new song',progress=None)
                    process=self.worker.ensure_process()
                    s.update(activeProcess=process,activeKind='music')
                    process.stdin.write(json.dumps({'root':str(self.worker.store.root),'output':str(directory/'render'),'generation':gen.model_dump(),'seed':seed,'kind':'generate',
                                                   'request':JobRequest(projectId='radio',generation=gen,approvedDownloads=self.generation_request(s).approvedDownloads).model_dump()})+'\n')
                    process.stdin.flush()
                for line in process.stdout:
                    event=json.loads(line)
                    if event.get('error'):raise RuntimeError(event['error'])
                    self.update(s,**event)
                    if event.get('done'):
                        with self.lock:
                            self.update(s)
                            s.update(activeProcess=None,activeKind=None)
                        return event
                raise RuntimeError('Music generation stopped before finishing. Retry the station.')
            except RuntimeError as exc:
                if attempt==0 and memory_error(exc):
                    self.release_writer();self.worker.kill();s['cacheBlocked']=True
                    s['modelResidency']='Models alternate to fit available VRAM'
                    self.remove(directory/'render')
                    self.update(s,state='Preparing',message='Releasing model memory and retrying',progress=None)
                else:raise

    def publish_track(self, s, track):
        # Consult the clock before replacing buffered audio: a crossfade may
        # have started while the new song was rendering.
        self.advance_clock(s)
        if track['directionRevision']!=s['revision'] and len(s['tracks'])>=2:
            self.remove(self.root/s['id']/track['id'])
            return False
        if track['directionRevision']==s['revision']:
            for old in list(s['tracks'][1:]):
                if old.get('startedAt') is None:
                    s['tracks'].remove(old);self.remove(self.root/s['id']/old['id'])
        s['tracks'].append(track)
        self.advance_clock(s)
        return True

    def generate(self, s):
        tid = secrets.token_hex(16)
        directory = self.root/s['id']/tid
        try:
            self.update(s)
            directory.mkdir(parents=True, exist_ok=True)
            request = self.generation_request(s)
            vocals=resolve_vocals(request.vocals,request.description)
            seed = secrets.randbelow(2**31)
            for attempt in range(2):
                try:
                    song=self.write_song(s,directory,seed)
                    break
                except RuntimeError as exc:
                    if attempt==0 and memory_error(exc):
                        self.release_writer();self.worker.kill();s['cacheBlocked']=True
                        self.update(s,state='Preparing',message='Releasing model memory and retrying',progress=None)
                    else:raise
            gen = Generation(style=request.description+'\n'+(language_direction(resolve_language(request.language,request.description)) if vocals!='instrumental' else 'Instrumental only. No sung vocals. Arrangement plan: '+song['lyrics'][:2400])+'\nMusical direction: '+song['style']+'\nArrangement length: '+('extended full-length song, about 5 minutes, developed verses, bridge, final chorus and outro' if request.length=='long' else 'complete song, about 3 minutes, verses, chorus and ending'),lyrics=song['lyrics'],role=vocals,
                             seed=seed,odeSteps=48 if request.quality=='high' else 32,
                             instrumentalSections='[intro]\n[verse]\n[chorus]\n[verse]\n[chorus]\n[bridge]\n[chorus]\n[outro]' if request.length=='long' else '[intro]\n[verse]\n[chorus]\n[bridge]\n[outro]')
            done = self.render_song(s,directory,gen,seed)
            import soundfile as sf
            source = directory/'render/audio.flac'
            info = sf.info(source)
            if info.duration < 5: raise RuntimeError('YuE2 returned an incomplete song. Retry for a fresh song.')
            source.replace(directory/'audio.flac')
            self.remove(directory/'render')

            with self.lock:
                self.update(s)
                s['count'] += 1
                s['recent'].append(song)
                self.publish_track(s,dict(id=tid,title=song['title'],style=song['style'],lyrics='' if vocals=='instrumental' else song['lyrics'],vocals=vocals,
                                        duration=info.duration,startedAt=None,number=s['count'],directionRevision=s.get('generationRevision',s['revision']),language=resolve_language(request.language,request.description),url=f"/api/radio/{s['id']}/audio/{tid}",seed=seed,
                                        adapters=done.get('adapters',[]),seconds=done.get('timing',{}).get('e2e_seconds'),peakVramGiB=done.get('timing',{}).get('peak_vram_gib'),truncated=hit_generation_limit(done.get('truncated'))))
                self.advance_clock(s)
                s.update(state='Ready',message='Your station is ready' if len(s['tracks'])>=2 else ('Preparing another original song' if s['listening'] else 'Joining the live broadcast'),progress=1)
        except InterruptedError:
            self.remove(directory)
        except Exception as exc:
            with self.lock:
                if s.get('generationRevision',s['revision'])==s['revision'] or s.get('activeKind')=='writer':self.release_writer()
            with self.lock:
                if not s['cancelled']:
                    if s.get('generationRevision',s['revision'])!=s['revision']:
                        s.update(state='Queued',error=None,message='Preparing your updated station direction',progress=None)
                    else:s.update(state='Failed',error=str(exc)[:600],message='Could not prepare the next song',progress=None)
            self.remove(directory)
        finally:
            with self.lock:
                s.update(active=False,activeProcess=None,activeKind=None)
                if not s['cancelled'] and s.get('generationRevision',s['revision'])!=s['revision']:
                    s.update(state='Queued',error=None,message='Preparing your updated station direction',progress=None)
                    self.worker.wake.set()
                if s['cancelled']: self.remove(self.root/s['id'])
            self.worker.status['stage'] = 'Ready'


def register(app, radio):
    from .radio_presets import register as register_presets
    register_presets(app,radio.worker.store)
    @app.get('/api/radio/options')
    def options():
        from .providers import capabilities
        text = capabilities()['text']
        return {**text,'bufferSize':2,'liveSession':True,'crossfadeSeconds':radio.CROSSFADE,'languages':[{'id':code,'name':name} for code,name in LANGUAGES.items()]}

    @app.get('/api/radio/current')
    def current(): return radio.current()

    @app.post('/api/radio')
    def create(request: StationRequest): return radio.create(request)

    @app.get('/api/radio/{sid}')
    def state(sid: str): return radio.snapshot(sid)

    @app.post('/api/radio/{sid}/direction')
    def direction(sid: str, request: StationDirection): return radio.retune(sid,request)

    @app.delete('/api/radio/{sid}')
    def stop(sid: str): return radio.stop(sid)

    @app.post('/api/radio/{sid}/retry')
    def retry(sid: str): return radio.retry(sid)

    @app.get('/api/radio/{sid}/audio/{tid}')
    def media(sid: str, tid: str):
        with radio.lock:
            if not any(t['id']==tid for t in radio.get(sid)['tracks']): raise KeyError('This radio song has ended')
            return FileResponse(radio.root/sid/tid/'audio.flac', media_type='audio/flac',headers={'Cache-Control':'private, no-store'})
