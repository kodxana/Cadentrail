import json,time
from pathlib import Path
import numpy as np
import pytest
import soundfile as sf
from PIL import Image
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.schema import Project,JobRequest
from backend.storage import Store
from backend.audio import ingest
from backend.alignment import match_lyrics
from backend.visual_schema import VisualAsset,LyricLine,TimedWord
from backend.visual_render import cover_image,render_video
from backend.portable import import_portable

def test_v1_migration_preserves_music_and_advanced_mix():
    p=Project();v1=p.model_dump();v1['schemaVersion']=1
    for k in ('visuals','creative','artist'):v1.pop(k)
    for k in ('odeSteps','temperature','topP','topK'):v1['generation'].pop(k)
    v1['generation'].update(abc='X:1\nK:C\nCDEF|',useScore=True)
    migrated=Project.model_validate(v1)
    assert migrated.schemaVersion==2 and migrated.generation.useScore
    assert migrated.generation.abc==v1['generation']['abc']
    assert migrated.tracks==p.tracks and migrated.visuals.assets==[]

def test_matching_never_invents_missing_word_timestamps():
    words=[{'text':w,'start':i,'end':i+.7,'probability':.98} for i,w in enumerate('we keep the light on'.split())]
    timing=match_lyrics('[Verse]\nwe keep the light on\nmissing melody forever',words,'asset')
    assert timing.coverage==pytest.approx(5/8)
    assert timing.lines[0].start==0 and timing.lines[0].end==4.7
    assert timing.lines[1].start is None
    assert all(w.start is None for w in timing.lines[1].words)
    assert timing.needsReview

def test_timing_rejects_words_outside_line():
    with pytest.raises(ValueError):LyricLine(text='word',start=1,end=2,words=[TimedWord(text='word',start=2,end=3)])

def test_cpu_lane_does_not_claim_gpu_job(tmp_path):
    store=Store(tmp_path);p=store.save(Project(),create=True)
    for kind in ('generate','video'):
        store.put_job({'id':kind,'projectId':p.id,'kind':kind,'state':'Queued','createdAt':time.time()})
    assert store.claim_job(('video','cover'))['id']=='video'
    assert store.job('generate')['state']=='Queued'

def test_visual_portable_roundtrip_and_cover(tmp_path):
    with TestClient(create_app(tmp_path/'one',start_worker=False)) as c:
        p=c.post('/api/projects',json={'name':'Visual project'}).json()
        import io
        image=Image.new('RGB',(600,800),'#224455');out=io.BytesIO();image.save(out,format='PNG')
        asset=c.post('/api/projects/'+p['id']+'/visuals/import',files={'file':('background.png',out.getvalue(),'image/png')}).json()
        current=c.get('/api/projects/'+p['id']).json();current['visuals']['cover'].update(backgroundId=asset['id'],title='Midnight radio',artist='Test artist')
        assert c.put('/api/projects/'+p['id'],json=current).status_code==200
        raw=c.get('/api/projects/'+p['id']+'/portable');archive=tmp_path/'portable.zip';archive.write_bytes(raw.content)
    store=Store(tmp_path/'two');restored=import_portable(store,archive)
    assert restored.visuals.assets[0].id==asset['id']
    cover=cover_image(store,restored,restored.visuals.cover.model_dump(),size=512)
    assert cover.size==(512,512) and len(cover.getcolors(512*512))>10


def test_duplicate_remaps_audio_lineage(tmp_path):
    with TestClient(create_app(tmp_path/'lineage',start_worker=False)) as c:
        p=c.post('/api/projects',json={'name':'Lineage'}).json()
        store=Store(tmp_path/'lineage');path=tmp_path/'source.wav';sf.write(path,np.zeros((4800,2)),48000)
        source=ingest(store,p['id'],path,'Original');derived=ingest(store,p['id'],path,'Master','master',{'sourceAssetIds':[source['id']]})
        clone=c.post('/api/projects/'+p['id']+'/duplicate').json();assets=c.get('/api/projects/'+clone['id']+'/assets').json()
        original=next(a for a in assets if a['name']=='Original');master=next(a for a in assets if a['name']=='Master')
        assert master['lineage']['sourceAssetIds']==[original['id']]
        assert original['id']!=source['id'] and master['id']!=derived['id']

def test_real_server_video_has_audio_and_timed_lyrics(tmp_path):
    import imageio_ffmpeg
    store=Store(tmp_path/'video');p=store.save(Project(name='Synchronized test'),create=True)
    rate=48000;t=np.arange(rate*2)/rate;source=tmp_path/'tone.wav';sf.write(source,np.column_stack([np.sin(2*np.pi*220*t)*.1]*2),rate,subtype='FLOAT')
    asset=ingest(store,p.id,source,'Test source')
    p.visuals.video.audioAssetId=asset['id'];p.visuals.video.duration=1
    p.visuals.video.visualizer='bars';p.visuals.video.intro=False
    p.visuals.timing.assetId=asset['id'];p.visuals.timing.needsReview=False
    p.visuals.timing.lines=[LyricLine(text='Hello song',start=0,end=1,words=[TimedWord(text='Hello',start=0,end=.45),TimedWord(text='song',start=.45,end=1)])]
    p=store.save(p);request=JobRequest(projectId=p.id,kind='video',options={'design':p.visuals.video.model_dump()})
    job={'id':'ab'*16,'projectId':p.id,'kind':'video','state':'Preparing','createdAt':time.time(),'request':request.model_dump(),'snapshot':p.model_dump()};store.put_job(job)
    stages=[];result=render_video(store,job,lambda state,message,**extra:stages.append(state))
    media=store.load(p.id).visuals.assets[0];path=store.project_dir(p.id)/media.path
    reader=imageio_ffmpeg.read_frames(str(path));metadata=next(reader);first=next(reader);reader.close()
    assert metadata['fps']==30 and metadata['duration']==pytest.approx(1,abs=.05)
    assert result['width']==1920 and result['height']==1080
    assert 'Rendering frames' in stages and 'Finalizing' in stages
    assert len(first)==1920*1080*3 and source.exists()
    import subprocess
    from backend.audio import ffmpeg
    decoded=subprocess.run([ffmpeg(),'-v','error','-i',str(path),'-vn','-f','f32le','-ar','48000','-ac','1','pipe:1'],capture_output=True,check=True).stdout
    pcm=np.frombuffer(decoded,dtype=np.float32)[:rate]
    assert len(pcm)==rate and np.corrcoef(pcm[1000:-1000],np.sin(2*np.pi*220*t[:rate])[1000:-1000])[0,1]>.98
    def highlight_pixels(at):
        raw=subprocess.run([ffmpeg(),'-v','error','-ss',str(at),'-i',str(path),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True).stdout
        rgb=np.frombuffer(raw,dtype=np.uint8).reshape(1080,1920,3)[800:990]
        return np.count_nonzero((rgb[:,:,0]>190)&(rgb[:,:,1]>110)&(rgb[:,:,1]<215)&(rgb[:,:,2]<140))
    assert highlight_pixels(.7)>highlight_pixels(.2)*1.15


def test_automatic_video_requires_reliable_timing():
    from backend.auto_video import confident_timing
    from backend.visual_schema import LyricTiming
    t=LyricTiming(assetId='a',coverage=1,lines=[LyricLine(text='hello',start=1,end=2,words=[TimedWord(text='hello',start=1,end=2,confidence=.99)])])
    assert confident_timing(t,'a')
    t.lines[0].words[0].confidence=.5
    assert not confident_timing(t,'a')
    t.needsReview=False
    assert confident_timing(t,'a') and not confident_timing(t,'different-take')
    t.sourceLyrics='hello'
    assert confident_timing(t,'a','hello')
    assert not confident_timing(t,'a','different lyrics')
    t.lines.append(LyricLine(text='overlap',start=1.5,end=3))
    assert not confident_timing(t,'a','hello')


def test_visualizer_lyric_scenes_cannot_bypass_timing_review(tmp_path):
    from backend.visual_schema import VideoScene
    store=Store(tmp_path/'video-review');p=store.save(Project(),create=True)
    source=tmp_path/'source.wav';sf.write(source,np.zeros(48000),48000)
    asset=ingest(store,p.id,source,'Source')
    d=p.visuals.video;d.audioAssetId=asset['id'];d.kind='visualizer'
    d.scenes=[VideoScene(type='lyrics',start=0,end=1)]
    p.visuals.timing.assetId=asset['id']
    p.visuals.timing.lines=[LyricLine(text='Review this',start=0,end=1)]
    job={'snapshot':p.model_dump(),'request':{'options':{'design':d.model_dump()}}}
    with pytest.raises(ValueError,match='Review lyric timing'):render_video(store,job,lambda *a,**kw:None)


def test_automatic_video_queues_and_finishes_without_browser(tmp_path):
    from backend.jobs import Worker
    store=Store(tmp_path/'automatic');p=store.save(Project(name='Automatic video'),create=True)
    path=tmp_path/'source.wav';sf.write(path,np.sin(np.arange(48000)*.06)*.1,48000)
    asset=ingest(store,p.id,path,'Source');worker=Worker(store);worker.start()
    try:
        job=worker.enqueue(JobRequest(projectId=p.id,kind='music-video',assetId=asset['id'],options={'lyrics':False,'duration':.5}))
        deadline=time.time()+45
        while time.time()<deadline:
            job=store.job(job['id'])
            if job['state'] in ('Complete','Failed'):break
            time.sleep(.2)
        assert job['state']=='Complete',job.get('message')
        assert job['result']['visualAssetId'] in [a.id for a in store.load(p.id).visuals.assets]
        assert not job['result']['lyricsIncluded']
        assert len(job['children'])==1
    finally:worker.stop()


def test_preview_is_short_lower_resolution_and_preserves_original_audio(tmp_path):
    import imageio_ffmpeg,hashlib
    store=Store(tmp_path/'preview');p=store.save(Project(name='Preview fixture'),create=True)
    source=tmp_path/'audio.wav';sf.write(source,np.sin(2*np.pi*220*np.arange(14*48000)/48000)*.1,48000)
    original=hashlib.sha256(source.read_bytes()).hexdigest()
    asset=ingest(store,p.id,source,'QA audio')
    p.visuals.video.audioAssetId=asset['id'];p.visuals.video.preview=True;p.visuals.video.duration=14;p.visuals.video.kind='visualizer'
    p=store.save(p)
    job={'id':'cd'*16,'projectId':p.id,'kind':'video','state':'Preparing','createdAt':time.time(),'request':JobRequest(projectId=p.id,kind='video',options={'design':p.visuals.video.model_dump()}).model_dump(),'snapshot':p.model_dump()}
    store.put_job(job);result=render_video(store,job,lambda *args,**kwargs:None)
    media=store.load(p.id).visuals.assets[-1]
    reader=imageio_ffmpeg.read_frames(str(store.project_dir(p.id)/media.path));metadata=next(reader);reader.close()
    assert (result['width'],result['height'])==(640,360)
    assert metadata['fps']==24 and metadata['duration']==pytest.approx(12,abs=.05)
    assert hashlib.sha256(source.read_bytes()).hexdigest()==original
    assert media.settings['design']['preview'] is True
