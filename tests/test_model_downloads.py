from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.schema import Project,JobRequest
from backend.storage import Store
from backend.jobs import Worker
from backend import model_runtime as models
from backend import auto_video  # Load collaborators before per-test capability overrides.

@pytest.fixture
def optional_host(tmp_path,monkeypatch):
    monkeypatch.delenv('DAW_CORE_MODELS',raising=False)
    monkeypatch.setattr('backend.visual_api.capabilities',lambda:{'text':{'available':True},'artwork':{'available':True},'alignment':{'available':True}})
    # Small real files exercise completeness without allocating actual model weights.
    spec={**models.MODELS['qwen-1.7B'],'files':[{'path':'config.json','bytes':2},{'path':'weights.safetensors','bytes':3}],'bytes':5}
    monkeypatch.setitem(models.MODELS,'qwen-1.7B',spec)
    return tmp_path/'store'

def test_unapproved_download_does_not_create_job_or_change_model_storage(optional_host):
    with TestClient(create_app(optional_host,start_worker=False)) as c:
        p=c.post('/api/projects',json={'name':'My song'}).json()
        before=c.get('/api/projects/'+p['id']).json()
        files=list((optional_host/'models').rglob('*'))
        payload={'kind':'lyrics','projectId':p['id'],'options':{'model':'Qwen/Qwen3-1.7B'}}
        response=c.post('/api/jobs',json=payload)
        assert response.status_code==428
        detail=response.json()['detail']
        assert detail['models'][0]['id']=='qwen-1.7B' and detail['models'][0]['name']
        assert detail['downloadBytes']==5 and detail['freeBytes']>0
        assert c.get('/api/jobs').json()==[]
        assert list((optional_host/'models').rglob('*'))==files
        assert c.get('/api/projects/'+p['id']).json()==before
        accepted=c.post('/api/jobs',json={**payload,'approvedDownloads':['qwen-1.7B']})
        assert accepted.status_code==200 and accepted.json()['state']=='Queued'
        assert accepted.json()['request']['approvedDownloads']==['qwen-1.7B']

def test_partial_model_requests_only_missing_bytes_and_cached_model_needs_no_prompt(optional_host):
    store=Store(optional_host);p=store.save(Project(),create=True)
    path=models.model_path(store.root,'qwen-1.7B');path.mkdir(parents=True)
    (path/'config.json').write_bytes(b'{}')
    request=JobRequest(projectId=p.id,kind='lyrics',options={'model':'Qwen/Qwen3-1.7B'})
    with pytest.raises(models.ModelDownloadRequired) as error:models.check_downloads(store.root,p,request)
    assert error.value.detail['downloadBytes']==3
    (path/'weights.safetensors').write_bytes(b'abc')
    assert models.check_downloads(store.root,p,request)==[]
    assert Worker(store).enqueue(request)['state']=='Queued'

def test_retry_requires_consent_for_missing_model(optional_host):
    store=Store(optional_host);p=store.save(Project(),create=True);worker=Worker(store)
    request=JobRequest(projectId=p.id,kind='lyrics',options={'model':'Qwen/Qwen3-1.7B'})
    store.put_job({'id':'previous','projectId':p.id,'kind':'lyrics','state':'Failed','request':request.model_dump(),'createdAt':0})
    with pytest.raises(models.ModelDownloadRequired):worker.retry('previous')
    assert store.job('previous')['state']=='Failed'
    assert worker.retry('previous',['qwen-1.7B'])['state']=='Queued'

def test_bundled_core_resolves_without_user_cache(tmp_path,monkeypatch):
    root=tmp_path/'storage';root.mkdir();bundle=tmp_path/'bundle';bundle.mkdir()
    monkeypatch.setenv('DAW_CORE_MODELS',str(bundle))
    for key in ('yue2','yue2-vae'):
        monkeypatch.setitem(models.MODELS,key,{**models.MODELS[key],'files':[{'path':'model.bin','bytes':3}],'bytes':3})
        path=bundle/key;path.mkdir();(path/'model.bin').write_bytes(b'abc')
    request=JobRequest(projectId='test',kind='generate')
    assert models.check_downloads(root,None,request)==[]
    options=models.core_options(root)
    assert options=={'model':str(bundle/'yue2'),'vae':str(bundle/'yue2-vae'),'local_files_only':True}
    assert not (root/'models').exists()
    (bundle/'yue2'/'model.bin').write_bytes(b'a')
    with pytest.raises(ValueError,match='included model'):models.check_downloads(root,None,request)

def test_automatic_video_requests_only_needed_dependencies(tmp_path,monkeypatch):
    monkeypatch.setattr('backend.providers.capabilities',lambda:{'artwork':{'available':True},'alignment':{'available':True}})
    p=Project();p.generation.lyrics='A song with words'
    request=JobRequest(projectId=p.id,kind='music-video',assetId='audio',options={})
    assert models.required_models(tmp_path,p,request)==['sdxl','whisper']
    from backend.visual_schema import LyricLine,TimedWord
    p.visuals.timing.assetId='audio'
    p.visuals.timing.lines=[LyricLine(text='A song',start=0,end=1,words=[TimedWord(text='song',start=0,end=1)])]
    assert models.required_models(tmp_path,p,request)==['sdxl','whisper']
    from backend.visual_schema import VisualAsset
    p.visuals.assets.append(VisualAsset(id='c'*32,name='Cover',path='visuals/cover.png',width=1024,height=1024))
    p.visuals.coverId='c'*32;request.options={'lyrics':False}
    assert models.required_models(tmp_path,p,request)==[]

def test_download_rechecks_consent_before_network(optional_host,monkeypatch):
    store=Store(optional_host);p=Project();request=JobRequest(projectId=p.id,kind='lyrics',options={'model':'Qwen/Qwen3-1.7B'})
    with pytest.raises(models.ModelDownloadRequired):models.prepare_models(store.root,p,request,lambda **event:None)
    assert not models.model_path(store.root,'qwen-1.7B').exists()


def test_changed_lyrics_request_alignment_again(tmp_path,monkeypatch):
    from backend.visual_schema import LyricLine, LyricTiming
    monkeypatch.setattr('backend.providers.capabilities',lambda:{'artwork':{'available':False},'alignment':{'available':True}})
    p=Project();p.generation.lyrics='New chorus'
    p.visuals.timing=LyricTiming(assetId='audio',sourceLyrics='Old chorus',needsReview=False,lines=[LyricLine(text='Old chorus',start=1,end=3)])
    request=JobRequest(projectId=p.id,kind='music-video',assetId='audio')
    assert models.required_models(tmp_path,p,request)==['whisper']
    p.generation.lyrics='Old chorus'
    assert models.required_models(tmp_path,p,request)==[]


def test_incomplete_stem_model_is_not_reported_as_installed(tmp_path,monkeypatch):
    monkeypatch.setitem(models.MODELS,'demucs',{**models.MODELS['demucs'],'bytes':3000000})
    path=models.model_path(tmp_path,'demucs');path.parent.mkdir(parents=True)
    with path.open('wb') as stream:stream.truncate(2000000)
    assert not models.inventory(tmp_path,'demucs')['ready']
    with path.open('wb') as stream:stream.truncate(3000000)
    assert models.inventory(tmp_path,'demucs')['ready']


def test_retry_checks_the_saved_video_snapshot_not_new_project_lyrics(tmp_path,monkeypatch):
    monkeypatch.setattr('backend.providers.capabilities',lambda:{'artwork':{'available':False},'alignment':{'available':True}})
    store=Store(tmp_path/'store');p=store.save(Project(),create=True)
    snapshot=p.model_copy(deep=True);snapshot.generation.lyrics='The original song'
    request=JobRequest(projectId=p.id,kind='music-video',assetId='audio')
    store.put_job({'id':'failed-video','projectId':p.id,'kind':'music-video','state':'Failed','createdAt':0,'request':request.model_dump(),'snapshot':snapshot.model_dump()})
    with pytest.raises(models.ModelDownloadRequired) as error:Worker(store).retry('failed-video')
    assert [m['id'] for m in error.value.detail['models']]==['whisper']
    assert store.job('failed-video')['state']=='Failed'


@pytest.mark.parametrize('key',['realaudio-v4','demucs','sortformer'])
def test_included_tools_use_image_and_cannot_be_removed(tmp_path,monkeypatch,key):
    from backend.maintenance import remove_model
    store=Store(tmp_path/'store');bundle=tmp_path/'image'
    monkeypatch.setenv('DAW_BUNDLED_TOOLS',str(bundle))
    spec={**models.MODELS[key],'bytes':3,'files':[{'path':'model.bin','bytes':3}]}
    monkeypatch.setitem(models.MODELS,key,spec)
    path=models.model_path(store.root,key)
    file=path if key=='demucs' else path/'model.bin'
    file.parent.mkdir(parents=True);file.write_bytes(b'abc')
    assert file.is_relative_to(bundle)
    assert models.inventory(store.root,key)['ready'] and models.inventory(store.root,key)['bundled']
    request=JobRequest(projectId='included-check',kind='model-download',options={'modelId':key})
    assert models.check_downloads(store.root,None,request)==[]
    with pytest.raises(ValueError,match='Included'):remove_model(store,Worker(store),key)
    assert file.read_bytes()==b'abc'
    file.write_bytes(b'a')
    with pytest.raises(ValueError,match='included model'):models.check_downloads(store.root,None,request)
    assert not (store.root/'models'/'huggingface').exists()


def test_baked_realaudio_requests_only_its_missing_mert_dependency(tmp_path,monkeypatch):
    bundle=tmp_path/'image';monkeypatch.setenv('DAW_BUNDLED_TOOLS',str(bundle))
    spec={**models.MODELS['realaudio-v4'],'bytes':3,'files':[{'path':'head.pt','bytes':3}]}
    monkeypatch.setitem(models.MODELS,'realaudio-v4',spec)
    path=models.model_path(tmp_path,'realaudio-v4');path.mkdir(parents=True);(path/'head.pt').write_bytes(b'abc')
    request=JobRequest(projectId='dependency-check',kind='tokenize',options={'reconstruct':False})
    with pytest.raises(models.ModelDownloadRequired) as exc:models.check_downloads(tmp_path,None,request)
    assert [m['id'] for m in exc.value.detail['models']]==['mert']
    assert models.bundled_path('mert') is None
    assert models.bundled_path('sdxl') is None
