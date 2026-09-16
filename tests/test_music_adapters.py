import io, json, threading
from types import SimpleNamespace
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient
from backend.schema import Generation, HumSource, JobRequest, Project, Candidate
from backend.music_adapters import adapter_keys, generation_kwargs, instrumental_sections
from backend.hum_song import prepare_hum, pitch_score, remap_hum_sources
from backend import model_runtime as models
from backend.storage import Store
from backend.jobs import Worker
from backend.app import create_app


def test_instrumental_uses_trained_adapter_without_singing_stored_words():
    gen=Generation(style='Cinematic strings',role='instrumental',lyrics='Keep these words',instrumentalSections='[intro] do not sing this [chorus] [outro]').model_dump()
    assert adapter_keys(gen)==['instrumental-v1']
    request=generation_kwargs(gen,5)
    assert request['lyrics']=='[intro]\n[chorus]\n[outro]' and request['cot']=='full'
    assert gen['lyrics']=='Keep these words'
    gen['musicAdapter']='base'
    assert adapter_keys(gen)==[] and generation_kwargs(gen,5)['lyrics']==''
    gen.update(role='female',musicAdapter='auto')
    assert adapter_keys(gen)==[] and generation_kwargs(gen,5)['lyrics']=='Keep these words'
    gen.update(role='auto',style='Classical chamber music')
    assert adapter_keys(gen)==['instrumental-v1']
    gen.update(style='Classical opera with choir')
    assert adapter_keys(gen)==[]
    for description in ('Folk duet with an instrumental intro','Rock song with an instrumental bridge','Not instrumental'):
        gen['style']=description
        assert adapter_keys(gen)==[] and generation_kwargs(gen,5)['lyrics']=='Keep these words'
    gen['musicAdapter']='instrumental-v1'
    with pytest.raises(ValueError,match='requires Instrumental'):adapter_keys(gen)


def test_original_score_preserved_and_section_limit():
    g=Generation(style='Jazz',role='instrumental',useScore=True,abc='X:1\nK:C\nCDEF').model_dump()
    assert generation_kwargs(g,1)['abc']==g['abc']
    assert instrumental_sections('nonsense [female]')=='[instrumental]'
    assert instrumental_sections('[verse]'*99).count('[verse]')==32


def test_hum_and_instrumental_downloads_are_explicit_and_job_is_snapshot(tmp_path,monkeypatch):
    store=Store(tmp_path);p=Project();p.generation=Generation(style='Jazz',role='instrumental');p=store.save(p,create=True)
    worker=Worker(store);worker.status['available']=True
    original=models.inventory
    def installed_core(root,key):
        result=original(root,key)
        if key in ('yue2','yue2-vae'):result.update(ready=True,missingBytes=0)
        return result
    monkeypatch.setattr(models,'inventory',installed_core)
    req=JobRequest(projectId=p.id)
    with pytest.raises(models.ModelDownloadRequired) as exc:worker.enqueue(req)
    assert [m['id'] for m in exc.value.detail['models']]==['instrumental-v1'] and store.jobs()==[]
    job=worker.enqueue(req.model_copy(update={'approvedDownloads':['instrumental-v1']}))
    assert job['request']['generation']['role']=='instrumental'
    p.generation.role='female';store.save(p)
    store.patch_job(job['id'],state='Cancelled')
    retried=worker.retry(job['id'],['instrumental-v1'])
    assert retried['generation']['role']=='instrumental'
    hum=HumSource(assetId='a'*32,duration=4)
    assert models.required_models(tmp_path,None,JobRequest(projectId=p.id,generation=Generation(style='Folk',hum=hum)))==['yue2','yue2-vae','hum-v1']


def test_retune_download_refusal_keeps_live_direction(tmp_path,monkeypatch):
    from backend.radio import Radio,StationRequest,StationDirection
    worker=SimpleNamespace(store=Store(tmp_path),wake=threading.Event(),stopping=threading.Event())
    radio=Radio(worker);sid=radio.create(StationRequest(description='Folk duet'),verify=False)['id']
    original=models.inventory
    def core(root,key):
        value=original(root,key)
        if key in ('yue2','yue2-vae'):value.update(ready=True,missingBytes=0)
        return value
    monkeypatch.setattr(models,'inventory',core)
    before=radio.snapshot(sid)
    with pytest.raises(models.ModelDownloadRequired) as exc:radio.retune(sid,StationDirection(description='Classical piano instrumental',revision=1))
    assert [m['id'] for m in exc.value.detail['models']]==['instrumental-v1']
    after=radio.snapshot(sid)
    before.pop('serverTime');after.pop('serverTime')
    assert after==before


def audio_bytes(seconds=4):
    data=io.BytesIO();sr=8000
    sf.write(data,np.sin(2*np.pi*220*np.arange(sr*seconds)/sr)*.1,sr,format='WAV')
    return data.getvalue()


def test_hum_ownership_bounds_and_protected_studio_score(tmp_path,monkeypatch):
    app=create_app(tmp_path,start_worker=False)
    with TestClient(app) as c:
        p=c.post('/api/projects',json={'name':'Hum ownership'}).json()
        other=c.post('/api/projects',json={'name':'Another project'}).json()
        asset=c.post(f"/api/projects/{p['id']}/import",files={'file':('hum.wav',audio_bytes(),'audio/wav')}).json()
        other['generation']['hum']={'assetId':asset['id'],'duration':4}
        assert c.put('/api/projects/'+other['id'],json=other).status_code==422
        p['generation'].update(style='Warm folk',hum={'assetId':asset['id'],'duration':5})
        assert c.put('/api/projects/'+p['id'],json=p).status_code==422
        p['generation']['hum']['duration']=4
        p=c.put('/api/projects/'+p['id'],json=p).json()
        g={**p['generation'],'useScore':True,'abc':'X:1\nK:C\nCDEF'}
        blocked=c.post('/api/jobs',json={'projectId':p['id'],'generation':g})
        assert blocked.status_code==422 and 'protected' in blocked.text
        assert c.get('/api/jobs').json()==[]
        clone=c.post('/api/projects/'+p['id']+'/duplicate').json()
        assert clone['generation']['hum']['assetId']!=asset['id']
        assert c.get('/api/assets/'+clone['generation']['hum']['assetId']+'/audio').content==c.get('/api/assets/'+asset['id']+'/audio').content
        archive=c.get('/api/projects/'+p['id']+'/portable')
        restored=c.post('/api/projects/import-portable',files={'file':('hum.zip',archive.content,'application/zip')})
        assert restored.status_code==200,restored.text
        assert restored.json()['generation']['hum']['assetId'] not in (asset['id'],clone['generation']['hum']['assetId'])


def test_hum_history_remapping_preserves_lineage():
    p=Project(generation=Generation(hum=HumSource(assetId='a'*32,duration=4)))
    p.candidates=[Candidate(id='take',name='Take',jobId='job',seed=1,metadata={'generation':p.generation.model_dump(),'hum':{'sourceAssetId':'a'*32,'score':'keep'}})]
    remap_hum_sources(p,{'a'*32:'b'*32})
    assert p.generation.hum.assetId=='b'*32
    assert p.candidates[0].metadata['generation']['hum']['assetId']=='b'*32
    assert p.candidates[0].metadata['hum']=={'sourceAssetId':'b'*32,'score':'keep'}


def test_real_pitch_analysis_retains_notes_and_rejects_silence(tmp_path):
    from backend.score import parse_abc
    rate=24000;segments=[]
    for midi in (60,64,67,65):
        t=np.arange(rate)/rate;f=440*2**((midi-69)/12)
        # Harmonic monophonic validation signal, explicitly not a human voice.
        segments.append((np.sin(2*np.pi*f*t)+.3*np.sin(4*np.pi*f*t))*.1)
    path=tmp_path/'melody.wav';sf.write(path,np.concatenate(segments),rate)
    settings=HumSource(assetId='a'*32,duration=4,tempo=120).model_dump();events=[]
    carrier,abc,info=prepare_hum(path,settings,tmp_path,lambda **event:events.append(event))
    assert np.isfinite(carrier).all() and len(carrier)==48000*4
    assert info['voicedFraction']>.8 and info['experimental']
    parsed=parse_abc(abc)
    assert {60,64,67,65}.issubset({n['pitch'] for n in parsed['notes']})
    assert (tmp_path/'hum.json').is_file() and events[0]['state']=='Analyzing'
    sf.write(path,np.zeros(rate*4),rate)
    with pytest.raises(ValueError,match='quiet'):prepare_hum(path,settings,tmp_path,lambda **e:None)
    sf.write(path,np.random.default_rng(5).normal(0,.1,rate*4),rate)
    with pytest.raises(ValueError,match='clear enough'):prepare_hum(path,settings,tmp_path,lambda **e:None)


def test_instrumental_merge_rejects_partial_and_bad_weights_before_mutation():
    torch=pytest.importorskip('torch')
    from backend.music_adapters import merge_instrumental
    def block(names):return SimpleNamespace(**{name:torch.nn.Linear(3,3,bias=False) for name in names})
    layer=SimpleNamespace(self_attn=block(('q_proj','k_proj','v_proj','o_proj')),mlp=block(('gate_proj','up_proj','down_proj')))
    model=SimpleNamespace(model=SimpleNamespace(layers=[layer]));weights={}
    for kind,names in (('self_attn',('q_proj','k_proj','v_proj','o_proj')),('mlp',('gate_proj','up_proj','down_proj'))):
        for name in names:
            prefix=f'layers.0.{kind}.{name}';weights[prefix+'.lora_A']=torch.ones(2,3);weights[prefix+'.lora_B']=torch.ones(3,2)
    original=layer.self_attn.q_proj.weight.detach().clone();missing=weights.pop('layers.0.mlp.down_proj.lora_B')
    with pytest.raises(ValueError):merge_instrumental(model,weights)
    assert torch.equal(original,layer.self_attn.q_proj.weight)
    weights['layers.0.mlp.down_proj.lora_B']=missing
    merge_instrumental(model,weights)
    assert torch.allclose(original+2,layer.self_attn.q_proj.weight)
