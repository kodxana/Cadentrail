import contextlib,json,time
from urllib.parse import unquote
from pathlib import Path
import numpy as np
import soundfile as sf
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.audio import ingest
from backend.storage import Store
from backend.schema import Project,JobRequest
from backend.visual_schema import LyricDraft
from backend.providers import text_model,TEXT_MODELS
from backend.visual_api import validate_job
from backend.progress import install_pipeline_progress

def test_files_have_names_downloads_and_project_boundaries(tmp_path):
    root=tmp_path/'store';store=Store(root);p=store.save(Project(name='Named song'),create=True)
    source=tmp_path/'audio.wav';sf.write(source,np.zeros((4800,2)),48000)
    a=ingest(store,p.id,source,'A song with a name','test')
    p=store.mutate(p.id,lambda p:p.creative.lyricDrafts.append(LyricDraft(text='Original words',model='Qwen/Qwen3-4B',createdAt=time.time())),'Draft')
    with TestClient(create_app(root,start_worker=False)) as client:
        entries=client.get('/api/projects/'+p.id+'/files').json()
        audio=next(e for e in entries if e['kind']=='Audio')
        assert audio['name']=='A song with a name' and audio['size']>1000
        response=client.get(audio['url']);assert response.status_code==200
        assert 'A song with a name.wav' in unquote(response.headers['content-disposition'])
        assert response.content==store.asset_path(a['id']).read_bytes()
        assert 'A song with a name.wav' in unquote(client.get('/api/assets/'+a['id']+'/audio').headers['content-disposition'])
        text=next(e for e in entries if e['kind']=='Lyrics')
        assert client.get(text['url']).text=='Original words'
        assert client.patch(audio['url'],json={'name':'Coffee at 3AM'}).status_code==200
        assert store.asset(a['id'])['name']=='Coffee at 3AM'
        other=client.post('/api/projects',json={'name':'Other'}).json()
        assert client.get(audio['url'].replace(p.id,other['id'])).status_code==404
        assert client.get('/api/projects/'+p.id+'/files/..%2f..%2fsecret').status_code!=200

def test_assistance_selection_validates_and_preserves_model(monkeypatch,tmp_path):
    import backend.visual_api as api
    monkeypatch.setattr(api,'capabilities',lambda:{'text':{'available':True}})
    store=Store(tmp_path);p=store.save(Project(),create=True)
    for model in TEXT_MODELS:
        request=validate_job(store,p,JobRequest(projectId=p.id,kind='lyrics',options={'model':model['id']}))
        assert request.options['model']==model['id']
    with pytest.raises(ValueError):validate_job(store,p,JobRequest(projectId=p.id,kind='lyrics',options={'model':'unreviewed/arbitrary-code'}))
    assert text_model(None)=='Qwen/Qwen3-4B'

def test_pipeline_progress_uses_real_counts_and_unknown_token_total():
    class Pipeline:pass
    pipe=Pipeline();events=[];install_pipeline_progress(pipe,lambda **e:events.append(e))
    with pipe._status('Generating song',unit='tokens') as status:
        for _ in range(23):status.advance()
    assert events[-1]['unitsDone']==23 and events[-1]['progress'] is None
    with pipe._status('Synthesizing audio',unit='steps') as status:status.update(16,total=32)
    assert events[-1]['unitsTotal']==32 and events[-1]['progress']==.5

def test_job_terminal_time_does_not_change_after_cancellation(tmp_path):
    store=Store(tmp_path);p=store.save(Project(),create=True)
    store.put_job({'id':'job','projectId':p.id,'kind':'generate','createdAt':time.time(),'state':'Queued'})
    running=store.claim_job();assert running['startedAt']>0
    cancelled=store.patch_job('job',state='Cancelled')
    late=store.patch_job('job',state='Complete',progress=1)
    assert late['state']=='Cancelled' and late['finishedAt']==cancelled['finishedAt']

def test_first_generation_keeps_starter_track_and_places_audio(tmp_path,monkeypatch):
    import io
    from backend.jobs import Worker
    from backend.schema import Track,Clip
    store=Store(tmp_path);p=store.save(Project(tracks=[Track(type='midi',name='Melody',clips=[Clip(name='Composition')])]),create=True)
    worker=Worker(store);worker.status['available']=True
    generation=p.generation.model_copy(update={'style':'Warm acoustic pop'})
    job=worker.enqueue(JobRequest(projectId=p.id,kind='generate',generation=generation,approvedDownloads=['yue2','yue2-vae']))
    folder=store.project_dir(p.id)/'generation'/job['id']/'0';folder.mkdir(parents=True)
    sf.write(folder/'audio.flac',np.zeros((4800,2)),48000)
    class Process:
        stdin=io.StringIO()
        stdout=io.StringIO(json.dumps({'done':True,'abc':'X:1\nK:C\nCDEF|','timing':{}})+'\n')
    monkeypatch.setattr(worker,'ensure_process',lambda:Process())
    worker.generate(job);current=store.load(p.id)
    assert current.tracks[0]==p.tracks[0]
    assert current.tracks[1].clips[0].assetId==current.candidates[0].assetId
    assert current.creative.selectedCandidateId==current.candidates[0].id
