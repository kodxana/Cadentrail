import json, threading, time
from types import SimpleNamespace
from pathlib import Path
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.radio import Radio, StationRequest, parse_song
from backend.storage import Store
from backend.app import create_app

@pytest.fixture(autouse=True)
def installed_music_for_radio_state_tests(monkeypatch):
    # State-machine fixtures bypass generation; emulate baked music dependencies only.
    from backend import model_runtime as models
    original = models.inventory
    def inventory(root, key):
        result = original(root, key)
        if key in ('yue2', 'yue2-vae', 'instrumental-v1'): result.update(ready=True, missingBytes=0)
        return result
    monkeypatch.setattr(models, 'inventory', inventory)


@pytest.fixture
def radio(tmp_path):
    store=Store(tmp_path)
    worker=SimpleNamespace(store=store,wake=threading.Event(),stopping=threading.Event(),status={},kills=0)
    def kill(): worker.kills+=1
    worker.kill=kill
    worker.terminate=lambda p:None
    instance=Radio(worker)
    yield instance
    instance.close()


def create(radio): return radio.create(StationRequest(description='Gentle indie folk with new stories'),verify=False)['id']

def track(radio,sid,index):
    tid=str(index)*32
    folder=radio.root/sid/tid;folder.mkdir(parents=True)
    (folder/'audio.flac').write_bytes(b'temporary audio')
    radio.session['tracks'].append({'id':tid,'title':'Song '+str(index),'duration':100,'startedAt':None})
    return tid


def test_buffer_and_server_clock_never_touch_library(radio):
    sid=create(radio)
    assert radio.take() is radio.session and radio.take() is None
    radio.session['active']=False
    one=track(radio,sid,1);two=track(radio,sid,2)
    assert radio.take() is None  # Full buffer: no more compute.
    radio.advance_clock(radio.session,now=1000)
    radio.advance_clock(radio.session,now=1096)
    assert radio.session["tracks"][1]["startedAt"]==1096
    radio.advance_clock(radio.session,now=1100)
    assert not (radio.root/sid/one).exists()
    radio.advance_clock(radio.session,now=1100)
    assert [t['id'] for t in radio.snapshot(sid)['tracks']]==[two]
    assert radio.take() is radio.session
    assert radio.worker.store.list_projects()==[] and radio.worker.store.jobs()==[]
    radio.session['active']=False
    radio.stop(sid)
    assert not (radio.root/sid).exists()


def test_stop_only_terminates_owned_radio_work(radio):
    sid=create(radio);track(radio,sid,1)
    radio.stop(sid);assert radio.worker.kills==0
    sid=create(radio);radio.take();radio.stop(sid)
    assert radio.worker.kills==1
    with pytest.raises(KeyError):radio.snapshot(sid)


def test_only_one_station_and_retry_is_explicit(radio):
    sid=create(radio)
    with pytest.raises(HTTPException) as exc:create(radio)
    assert exc.value.status_code==409
    radio.session['error']='writer failed'
    assert radio.take() is None
    radio.retry(sid)
    assert radio.take() is radio.session
    radio.session['active']=False


def test_restart_clears_temporary_station_but_preserves_projects(radio):
    sid=create(radio);track(radio,sid,1)
    sentinel=radio.worker.store.root/'projects'/'sentinel.txt';sentinel.write_text('keep')
    radio.start()
    assert not (radio.root/sid).exists() and sentinel.read_text()=='keep'
    with pytest.raises(ValueError):radio.remove(radio.worker.store.root/'projects')


def test_station_continues_without_browser_and_can_be_rejoined(radio):
    sid=create(radio);one=track(radio,sid,1);two=track(radio,sid,2)
    radio.advance_clock(radio.session,now=1000)
    radio.advance_clock(radio.session,now=1101)
    assert radio.current()['id']==sid
    assert radio.current()['tracks'][0]['id']==two
    assert not (radio.root/sid/one).exists()
    radio.stop(sid)
    assert radio.current() is None


def test_radio_media_requires_session_membership_and_auth(tmp_path,monkeypatch):
    monkeypatch.setenv('DAW_PASSWORD','radio-private')
    app=create_app(tmp_path,start_worker=False);radio=app.state.worker.radio
    with TestClient(app) as client:
        sid=create(radio);tid=track(radio,sid,1)
        url=f'/api/radio/{sid}/audio/{tid}'
        assert client.get(url).status_code==401
        assert client.post('/api/auth',json={'password':'radio-private'}).status_code==200
        response=client.get(url,headers={'Range':'bytes=0-3'})
        assert response.status_code==206 and response.content==b'temp'
        assert response.headers['cache-control']=='private, no-store'
        assert client.get(f'/api/radio/{sid}/audio/'+32*'9').status_code==404
        assert client.delete('/api/radio/'+sid,headers={'Origin':'https://foreign.invalid'}).status_code==403
        assert client.get('/api/radio/current').json()['id']==sid
        assert client.post(f'/api/radio/{sid}/advance',json={'trackId':tid}).status_code in (404,405)
        radio.advance_clock(radio.session,now=1000)
        radio.advance_clock(radio.session,now=1101)
        assert client.get(url).status_code==404
        assert client.get('/api/projects').json()==[] and client.get('/api/jobs').json()==[]


def test_repeated_or_malformed_lyrics_are_rejected():
    song={'title':'Window garden','style':'indie folk','lyrics':' '.join('word'+str(i) for i in range(40))}
    assert parse_song(json.dumps(song),[])==song
    with pytest.raises(ValueError):parse_song(json.dumps(song),[song])
    with pytest.raises(ValueError):parse_song('not json',[])
    with pytest.raises(ValueError):parse_song(json.dumps({**song,'lyrics':'Too short'}),[])


def test_radio_downloads_remain_explicit(radio,monkeypatch):
    from backend import providers
    from backend.model_runtime import ModelDownloadRequired
    monkeypatch.setattr(providers,'capabilities',lambda:{'text':{'available':True}})
    with pytest.raises(ModelDownloadRequired):radio.create(StationRequest(description='Gentle folk'))
    assert radio.session is None and radio.worker.store.list_projects()==[]


def test_creation_queue_wins_before_radio(monkeypatch,tmp_path):
    from backend.jobs import Worker
    worker=Worker(Store(tmp_path));calls=[]
    job={'id':'normal','kind':'generate'}
    monkeypatch.setattr(worker.store,'claim_job',lambda _:job)
    monkeypatch.setattr(worker,'generate',lambda _: (calls.append('creation'),worker.stopping.set()))
    monkeypatch.setattr(worker.store,'job',lambda _:{'state':'Generating'})
    monkeypatch.setattr(worker.store,'patch_job',lambda *a,**kw:None)
    monkeypatch.setattr(worker.radio,'take',lambda:calls.append('radio'))
    worker.run()
    assert calls==['creation']


def test_writer_format_accepts_multiline_lyrics_without_json_escaping():
    lyrics='\n'.join('Line '+str(i)+' carries its own story home' for i in range(12))
    result=parse_song('TITLE: Lanterns\nSTYLE: Gentle folk\nLYRICS:\n[Verse]\n'+lyrics,[])
    assert result['title']=='Lanterns' and result['lyrics']=='[Verse]\n'+lyrics
    raw='{"title":"Lanterns","style":"Folk","lyrics":"'+lyrics+'"}'
    assert parse_song(raw,[])['lyrics']==lyrics


@pytest.mark.parametrize('always_invalid',[False,True])
def test_writer_revises_invalid_drafts_with_a_bounded_retry(monkeypatch,tmp_path,always_invalid):
    import io
    from backend import radio_writer,download_progress
    request={'model':'Qwen/Qwen3-4B','approvedDownloads':[],'description':'Gentle folk','vocals':'female'}
    monkeypatch.setattr(radio_writer.sys,'stdin',io.StringIO(json.dumps({'root':str(tmp_path),'request':request,'recent':[],'seed':500})))
    monkeypatch.setattr(radio_writer,'prepare_models',lambda *a:None)
    monkeypatch.setattr(radio_writer,'required_models',lambda *a:['writer'])
    monkeypatch.setattr(radio_writer,'model_path',lambda *a:tmp_path)
    monkeypatch.setattr(download_progress,'install_download_progress',lambda *a:None)
    seeds=[];events=[]
    class Writer:
        def generate(self,options,progress):
            seeds.append(options['seed'])
            if always_invalid or len(seeds)==1:return {'text':'Incomplete draft'}
            return {'text':'TITLE: Orchard letters\nSTYLE: Gentle folk\nLYRICS:\n'+'\n'.join('Line '+str(i)+' carries its own story home' for i in range(12))}
    monkeypatch.setattr(radio_writer,'QwenProvider',Writer)
    monkeypatch.setattr(radio_writer,'emit',lambda **event:events.append(event))
    if always_invalid:
        with pytest.raises(ValueError):radio_writer.main()
        assert seeds==[500,501,502]
    else:
        radio_writer.main()
        assert seeds==[500,501] and events[-1]['song']['title']=='Orchard letters'


def test_length_targets_and_real_truncation_flags():
    from backend.radio import LENGTH_DIRECTION, hit_generation_limit
    from pydantic import ValidationError
    assert StationRequest(description='Soul').length=='long'
    assert '32 to 44' in LENGTH_DIRECTION['long']
    with pytest.raises(ValidationError):StationRequest(description='Soul',length='infinite')
    assert not hit_generation_limit({'abc':False,'semantic':False})
    assert hit_generation_limit({'abc':False,'semantic':True})
    assert not hit_generation_limit(None)


def test_music_oom_releases_writer_and_retries_same_song_once(radio):
    import io
    from backend.schema import Generation
    from types import SimpleNamespace
    sid=create(radio);s=radio.session;calls=[]
    streams=[{'error':'GPU memory exhausted. Retry after freeing GPU memory.'},{'done':True}]
    def process():
        calls.append('music')
        return SimpleNamespace(stdin=io.StringIO(),stdout=io.StringIO(json.dumps(streams.pop(0))+'\n'))
    radio.worker.ensure_process=process
    radio.release_writer=lambda:calls.append('release')
    result=radio.render_song(s,radio.root/sid/'test',Generation(),123)
    assert result['done'] and s['cacheBlocked']
    assert calls==['music','release','music']


def test_retuning_keeps_live_audio_and_freezes_inflight_direction(radio):
    from backend.radio import StationDirection
    sid=create(radio);one=track(radio,sid,1)
    radio.advance_clock(radio.session,now=1000)
    s=radio.take();old=radio.generation_request(s).model_dump()
    direction=StationDirection(description='Japanese J-pop, brighter choruses',language='ja',revision=1)
    changed=radio.retune(sid,direction)
    assert changed['id']==sid and changed['revision']==2 and changed['pendingDirection']
    assert changed['effectiveLanguage']=='ja'
    assert changed['tracks'][0]['id']==one and changed['tracks'][0]['startedAt']==1000
    assert radio.generation_request(s).model_dump()==old
    assert radio.worker.kills==0 and (radio.root/sid/one/'audio.flac').exists()
    assert radio.retune(sid,direction)['revision']==2  # A lost response is safe to retry.
    with pytest.raises(HTTPException) as exc:radio.retune(sid,StationDirection(description='Another tab',language='en',revision=1))
    assert exc.value.status_code==409
    s['active']=False;radio.take()
    assert radio.generation_request(s).language=='ja' and s['generationRevision']==2
    s['active']=False
    assert radio.worker.store.list_projects()==[] and radio.worker.store.jobs()==[]


def test_radio_direction_endpoint_requires_auth_and_rejects_foreign_origin(tmp_path,monkeypatch):
    monkeypatch.setenv('DAW_PASSWORD','radio-private')
    app=create_app(tmp_path,start_worker=False);radio=app.state.worker.radio
    with TestClient(app) as c:
        sid=create(radio);url=f'/api/radio/{sid}/direction';body={'description':'Dreamy J-pop','language':'ja','revision':1}
        assert c.post(url,json=body).status_code==401
        c.post('/api/auth',json={'password':'radio-private'})
        assert c.post(url,json=body,headers={'Origin':'https://foreign.invalid'}).status_code==403
        assert c.post(url,json={**body,'language':'unknown'}).status_code==422
        assert radio.snapshot(sid)['revision']==1
        response=c.post(url,json=body);assert response.status_code==200
        assert response.json()['effectiveLanguage']=='ja'
        assert c.get('/api/projects').json()==[] and c.get('/api/jobs').json()==[]


def test_japanese_language_and_space_free_lyrics():
    from backend.radio_language import resolve_language,check_language,lyric_units
    assert resolve_language('auto','Upbeat Japanese J-pop')=='ja'
    assert resolve_language('auto','Dreamy j-pop')=='ja'
    assert resolve_language('auto','夜の街を歩く二人の歌')=='ja'
    assert resolve_language('en','Japanese J-pop')=='en'
    assert resolve_language('auto','Japanese J-pop with English lyrics')=='en'
    assert resolve_language('auto','K-pop with soft drums')=='ko'
    lyrics='[Verse]\n夜の窓に小さな灯り\n君の声が遠く響く\n雨の街を二人で歩く\n新しい朝を探している\n[Chorus]\n風に乗せて願いを届けよう\nいつかまたここで会えるから'
    assert len(lyric_units(lyrics))>=24 and len(lyrics.split())<24
    assert parse_song(json.dumps({'title':'夜の窓','style':'J-pop','lyrics':lyrics}),[])['lyrics']==lyrics
    assert check_language(lyrics,'ja')['language']=='ja'
    with pytest.raises(ValueError):check_language(lyrics,'en')
    english='[Verse]\nThe morning train is waiting on the other side of town\nI carry all the words we never said and put them down\nThe letters in my pocket tell a story of their own'
    with pytest.raises(ValueError,match='Japanese'):check_language(english,'ja')
    with pytest.raises(ValueError):check_language(lyrics+'\nNever gonna give up on this journey through the night','ja')


def test_writer_rejects_wrong_language_before_synthesis(monkeypatch,tmp_path):
    from backend import radio_writer,download_progress
    monkeypatch.setattr(radio_writer,'prepare_models',lambda *a:None)
    monkeypatch.setattr(radio_writer,'required_models',lambda *a:['writer'])
    monkeypatch.setattr(radio_writer,'model_path',lambda *a:tmp_path)
    monkeypatch.setattr(download_progress,'install_download_progress',lambda *a:None)
    attempts=[];events=[]
    english='The morning train is waiting on the other side of town I carry all the words we never said and put them down The letters in my pocket tell a story of their own'
    japanese='夜の窓に小さな灯り\n君の声が遠く響く\n雨の街を二人で歩く\n新しい朝を探している\n風に乗せて願いを届けよう\nいつかまたここで会えるから'
    class Writer:
        def generate(self,options,progress):
            attempts.append(dict(options))
            return {'text':'TITLE: 灯り\nSTYLE: Dreamy J-pop\nLYRICS:\n'+(english if len(attempts)==1 else japanese)}
    monkeypatch.setattr(radio_writer,'emit',lambda **event:events.append(event))
    radio_writer.main({'root':str(tmp_path),'request':{'description':'J-pop','language':'ja','model':'Qwen/Qwen3-4B','vocals':'duet','approvedDownloads':[]},'seed':44,'recent':[]},Writer())
    assert len(attempts)==2 and attempts[1]['seed']==45
    assert 'Japanese' in attempts[0]['_lyricLanguage'] and 'Correction required' in attempts[1]['direction']
    assert events[-1]['song']['lyrics']==japanese


def test_obsolete_failed_draft_does_not_block_a_new_direction(radio,monkeypatch):
    from backend.radio import StationDirection
    sid=create(radio);s=radio.take()
    def failed(*args):
        radio.retune(sid,StationDirection(description='A new Japanese station',language='ja',revision=1))
        raise ValueError('Previous draft failed language verification')
    monkeypatch.setattr(radio,'write_song',failed)
    radio.generate(s)
    assert s['error'] is None and s['state']=='Queued' and not s['active']
    assert radio.take() is s and radio.generation_request(s).language=='ja'
    s['active']=False


@pytest.mark.parametrize('description,vocals,expected',[
    ('Bright Japanese J-pop','auto','auto'),
    ('Switch to classical orchestral music','auto','instrumental'),
    ('Classical music with choir','auto','auto'),
    ('Classical opera','auto','auto'),
    ('Classical orchestral music','female','female'),
    ('Piano jazz, no vocals','auto','instrumental'),
])
def test_automatic_vocals_follow_station_music(description,vocals,expected):
    from backend.radio import resolve_vocals
    assert resolve_vocals(vocals,description)==expected


def test_direction_preserves_explicit_voice_unless_changed(radio):
    from backend.radio import StationDirection
    sid=radio.create(StationRequest(description='J-pop',vocals='duet'),verify=False)['id']
    assert radio.retune(sid,StationDirection(description='Classical',revision=1))['effectiveVocals']=='duet'
    result=radio.retune(sid,StationDirection(description='Classical',revision=2,vocals='auto'))
    assert result['effectiveVocals']=='instrumental' and result['revision']==3


@pytest.mark.parametrize('crossfade_started',[False,True])
def test_retune_replaces_only_unbroadcast_audio_when_ready(radio,monkeypatch,crossfade_started):
    from backend.radio import StationDirection
    sid=create(radio);s=radio.session
    one=track(radio,sid,1);two=track(radio,sid,2)
    radio.advance_clock(s,now=1000)
    now=1097 if crossfade_started else 1020
    monkeypatch.setattr('backend.radio.time.time',lambda:now)
    radio.retune(sid,StationDirection(description='Classical',revision=1))
    assert radio.take() is s  # New direction can prepare even with a full fallback buffer.
    assert [t['id'] for t in s['tracks']]==[one,two]
    three=track(radio,sid,3);replacement=s['tracks'].pop();replacement['directionRevision']=2
    assert radio.publish_track(s,replacement)
    assert s['tracks'][0]['id']==one and s['tracks'][0]['startedAt']==1000
    assert [t['id'] for t in s['tracks']]==([one,two,three] if crossfade_started else [one,three])
    assert (radio.root/sid/two).exists()==crossfade_started
    s['active']=False
    assert radio.take() is None  # Buffer stays bounded, including an already airing overlap.
    if crossfade_started:
        assert s['tracks'][1]['startedAt']==1097
        radio.advance_clock(s,now=1100)
        assert [t['id'] for t in s['tracks']]==[two,three]
    assert radio.worker.kills==0 and radio.worker.store.list_projects()==[]


def test_obsolete_inflight_audio_does_not_displace_ready_fallback(radio,monkeypatch):
    from backend.radio import StationDirection
    sid=create(radio);s=radio.session
    one=track(radio,sid,1);two=track(radio,sid,2)
    radio.advance_clock(s,now=1000);monkeypatch.setattr('backend.radio.time.time',lambda:1020)
    radio.retune(sid,StationDirection(description='Classical',revision=1));radio.take()
    radio.retune(sid,StationDirection(description='Piano jazz',revision=2))
    three=track(radio,sid,3);obsolete=s['tracks'].pop();obsolete['directionRevision']=2
    assert not radio.publish_track(s,obsolete)
    assert [t['id'] for t in s['tracks']]==[one,two] and not (radio.root/sid/three).exists()
    s['active']=False
    assert radio.take() is s and radio.generation_request(s).description=='Piano jazz'
    s['active']=False


def test_classical_generation_uses_unsung_plan_and_instrumental_role(radio,monkeypatch):
    import numpy as np, soundfile as sf
    sid=radio.create(StationRequest(description='Classical orchestra',language='ja'),verify=False)['id'];s=radio.take()
    song={'title':'An orchestra unfolds','style':'Strings and woodwinds','lyrics':'Soft strings introduce a rising theme before woodwinds answer, piano expands the harmony, low brass builds a measured climax and quiet strings resolve the ending.'}
    monkeypatch.setattr(radio,'write_song',lambda *a:song)
    generations=[]
    def render(session,directory,gen,seed):
        generations.append(gen)
        (directory/'render').mkdir()
        sf.write(directory/'render/audio.flac',np.zeros(6*8000),8000)
        return {}
    monkeypatch.setattr(radio,'render_song',render)
    radio.generate(s)
    assert s['error'] is None and generations[0].role=='instrumental'
    assert 'Arrangement plan: '+song['lyrics'] in generations[0].style
    assert s['tracks'][0]['vocals']=='instrumental' and s['tracks'][0]['lyrics']==''
    assert radio.worker.store.list_projects()==[]


@pytest.mark.parametrize('kind',['writer','music'])
def test_retune_interrupts_only_active_radio_process_and_preserves_broadcast(radio,monkeypatch,kind):
    from backend.radio import StationDirection
    sid=create(radio);track(radio,sid,1);radio.advance_clock(radio.session,now=1000)
    s=radio.take();owned=object();cached=object();terminated=[]
    radio.worker.process=owned if kind=='music' else cached
    radio.writer_process=owned if kind=='writer' else cached
    radio.worker.terminate=lambda p:terminated.append(p)
    def kill():
        terminated.append(radio.worker.process);radio.worker.process=None
    radio.worker.kill=kill
    s.update(activeProcess=owned,activeKind=kind)
    radio.retune(sid,StationDirection(description='Classical piano',revision=1))
    assert terminated==[owned] and s['tracks'][0]['startedAt']==1000
    with pytest.raises(InterruptedError):radio.update(s,state='Generating')
    assert s['state']=='Queued'
    # Another request while the obsolete process unwinds cannot kill a newly owned process.
    radio.worker.process=cached;radio.writer_process=cached
    radio.retune(sid,StationDirection(description='Warm jazz',revision=2))
    assert terminated==[owned]
    radio.writer_process=None;s['active']=False


def test_obsolete_draft_never_starts_render_and_cleans_partial_files(radio,monkeypatch):
    from backend.radio import StationDirection
    sid=create(radio);s=radio.take();rendered=[]
    def write(session,directory,seed):
        (directory/'partial.txt').write_text('temporary draft')
        radio.retune(sid,StationDirection(description='Classical piano',revision=1))
        radio.update(s)
    monkeypatch.setattr(radio,'write_song',write)
    monkeypatch.setattr(radio,'render_song',lambda *a:rendered.append(True))
    radio.generate(s)
    assert not rendered and not list((radio.root/sid).iterdir())
    assert s['state']=='Queued' and s['error'] is None and not s['active']
    assert radio.take() is s and radio.generation_request(s).description=='Classical piano'
    s['active']=False


def test_retune_does_not_kill_creation_or_cached_idle_models(radio):
    from backend.radio import StationDirection
    sid=create(radio);radio.worker.process=object();terminated=[];radio.worker.terminate=lambda p:terminated.append(p)
    radio.retune(sid,StationDirection(description='Classical piano',revision=1))
    assert radio.worker.kills==0 and terminated==[]


def test_live_preset_writer_change_requires_consent_before_mutating(radio):
    from backend.radio import StationDirection
    from backend.model_runtime import ModelDownloadRequired
    sid=create(radio)
    with pytest.raises(ModelDownloadRequired):radio.retune(sid,StationDirection(description='Japanese nights',model='Qwen/Qwen3-8B',revision=1))
    assert radio.snapshot(sid)['revision']==1
    changed=radio.retune(sid,StationDirection(description='Classical piano',quality='high',length='standard',revision=1))
    assert changed['settings']['quality']=='high' and changed['settings']['length']=='standard'
    assert 'approvedDownloads' not in changed['settings']


@pytest.mark.parametrize('kind',['writer','music'])
def test_real_subprocess_cancellation_unblocks_radio_and_keeps_live_file(radio,monkeypatch,kind):
    import subprocess,sys
    from backend.radio import StationDirection
    from backend.jobs import Worker
    sid=create(radio);live=track(radio,sid,1);radio.advance_clock(radio.session)
    s=radio.take();started=s['tracks'][0]['startedAt'];children=[]
    radio.worker.process=None;radio.worker.kill=lambda:Worker.kill(radio.worker);radio.worker.terminate=Worker.terminate
    original=subprocess.Popen
    monkeypatch.setattr('backend.gpu.gpu_status',lambda:{'devices':[]})
    def spawn(*args,**kwargs):
        process=original([sys.executable,'-u','-c','import json,time;print(json.dumps({"state":"Generating","message":"CPU cancellation fixture"}),flush=True);time.sleep(60)'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8')
        children.append(process);return process
    if kind=='writer':monkeypatch.setattr('backend.radio.subprocess.Popen',spawn)
    else:
        monkeypatch.setattr(radio,'write_song',lambda *args:{'title':'Temporary','style':'Folk','lyrics':'A quiet morning brings a story through the window as the wind carries our voices across the fields and into another gentle day of hope'})
        def ensure():radio.worker.process=spawn();return radio.worker.process
        radio.worker.ensure_process=ensure
    thread=threading.Thread(target=radio.generate,args=(s,),daemon=True);thread.start()
    try:
        deadline=time.monotonic()+5
        while s.get('activeProcess') is None and time.monotonic()<deadline:time.sleep(.01)
        assert s.get('activeKind')==kind
        radio.retune(sid,StationDirection(description='Classical instrumental',revision=1))
        thread.join(4);assert not thread.is_alive()
        assert all(child.poll() is not None for child in children)
        assert s['state']=='Queued' and s['error'] is None and not s['active']
        assert [t['id'] for t in s['tracks']]==[live] and s['tracks'][0]['startedAt']==started
        assert (radio.root/sid/live/'audio.flac').exists()
        assert len(list((radio.root/sid).glob('*/')))==1
        assert radio.take() is s and s['generationRevision']==2
        s['active']=False
    finally:
        for child in children:Worker.terminate(child)
        thread.join(4)
