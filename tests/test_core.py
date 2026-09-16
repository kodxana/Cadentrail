import io
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient
from backend.schema import Project, Track, Clip, Note, Automation, Point, JobRequest
from backend.storage import Store, Conflict
from backend import audio, score
from backend.app import create_app
from backend.jobs import Worker
from backend.render import encode, render_job


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path / "storage")


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "app", start_worker=False)) as c:
        yield c


def test_stale_save_cannot_overwrite_and_revisions_survive_restart(store):
    p = store.save(Project(name="Original"), create=True)
    stale = p.model_copy(deep=True)
    p.name = "New name"
    saved = store.save(p, "Rename")
    with pytest.raises(Conflict):
        store.save(stale)
    reopened = Store(store.root).load(p.id)
    assert reopened.name == "New name" and reopened.revision == saved.revision
    assert json.loads((store.project_dir(p.id)/"project.json").read_text())["name"] == "New name"
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM revisions WHERE project_id=?", (p.id,)).fetchone()[0] == 2


def test_concurrent_worker_updates_do_not_lose_edits(store):
    p = store.save(Project(), create=True)
    def add(index):
        store.mutate(p.id, lambda p: p.tags.append(str(index)), "Tag")
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(add, range(8)))
    assert sorted(store.load(p.id).tags) == [str(i) for i in range(8)]


def test_invalid_routing_and_nonfinite_project_rejected():
    with pytest.raises(ValueError):
        Project(tempo=float('nan'))
    a, b = Track(type="bus"), Track(type="bus")
    a.output, b.output = b.id, a.id
    with pytest.raises(ValueError):
        Project(tracks=[a,b])
    with pytest.raises(ValueError):
        Project(loopStart=4, loopEnd=2)
    with pytest.raises(ValueError):
        Automation(parameter="pan", points=[Point(value=2)])


def test_paths_are_confined(store):
    for path in ('../outside','a/../../b','C:\\Windows','not-an-id'):
        with pytest.raises(ValueError):
            store.project_dir(path)


def test_cancelled_job_cannot_be_resurrected_by_late_event(store):
    p=store.save(Project(),create=True)
    store.put_job({"id":"job","projectId":p.id,"state":"Queued","createdAt":time.time()})
    store.patch_job("job",state="Cancelled")
    store.patch_job("job",state="Complete")
    assert store.job("job")["state"] == "Cancelled"


def test_queue_claim_is_exclusive(store):
    p=store.save(Project(),create=True)
    store.put_job({"id":"job","projectId":p.id,"state":"Queued","createdAt":time.time()})
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims=list(pool.map(lambda _:store.claim_job(),range(2)))
    assert sum(c is not None for c in claims)==1


def test_restart_preserves_queued_and_flags_interrupted(store):
    p=store.save(Project(),create=True)
    store.put_job({"id":"active","projectId":p.id,"state":"Rendering","createdAt":time.time()})
    worker=Worker(store)
    worker.start()
    worker.stop()
    assert store.job('active')['state']=='Failed'
    assert 'restart' in store.job('active')['message']


def test_abc_chromatic_fractional_roundtrip():
    notes=[Note(beat=0,pitch=60,duration=1/3),Note(beat=1/3,pitch=61,duration=2/3),Note(beat=1,pitch=60,duration=1),Note(beat=3,pitch=48,duration=.5)]
    abc=score.write_abc([n.model_dump() for n in notes],[],104)
    parsed=score.parse_abc(abc)
    actual=[(n['pitch'],n['beat'],n['duration']) for n in parsed['notes']]
    assert actual==pytest.approx([(n.pitch,n.beat,n.duration) for n in notes])


def test_abc_polyphonic_roundtrip_and_harmony():
    notes=[Note(beat=0,pitch=60,duration=4),Note(beat=0,pitch=64,duration=2),Note(beat=2,pitch=67,duration=2),Note(beat=4,pitch=65,duration=4)]
    chords=[{"beat":0,"duration":4,"symbol":"Cmaj7"},{"beat":4,"duration":4,"symbol":"Dm7"}]
    parsed=score.parse_abc(score.write_abc([n.model_dump() for n in notes],chords))
    assert sorted((n['pitch'],n['beat'],n['duration']) for n in parsed['notes'])==sorted((n.pitch,n.beat,n.duration) for n in notes)
    assert [c['symbol'] for c in parsed['chords']]==['Cmaj7','Dm7']


def test_midi_preserves_velocity_channel_and_overlap():
    notes=[Note(beat=0,pitch=60,duration=1,velocity=73,channel=2),Note(beat=.5,pitch=60,duration=2,velocity=119,channel=2),Note(beat=1/3,pitch=80,duration=1/3,channel=5)]
    result=score.read_midi(score.write_midi([n.model_dump() for n in notes],137))
    actual=sorted(result['tracks'][0]['notes'],key=lambda n:(n['beat'],n['pitch']))
    expected=sorted(notes,key=lambda n:(n.beat,n.pitch))
    for a,n in zip(actual,expected):
        assert a['pitch']==n.pitch and a['velocity']==n.velocity and a['channel']==n.channel
        assert a['beat']==pytest.approx(n.beat,abs=1/960)
        assert a['duration']==pytest.approx(n.duration,abs=1/960)
    assert result['tempo']==pytest.approx(137,abs=.001)


def test_waveform_pyramid_and_reverse_segments(tmp_path):
    path=tmp_path/'test.wav'
    samples=np.zeros((48000,2),dtype=np.float32)
    samples[256,0]=.75
    samples[10000,1]=-.6
    sf.write(path,samples,48000,subtype='FLOAT')
    peaks=audio.build_peaks(path,tmp_path/'peaks.json')
    base=json.loads((tmp_path/peaks['levels'][0]['file']).read_text())
    assert base['peaks'][1][0][1]==.75
    assert len(peaks['levels'])>=1
    data,sr=sf.read(io.BytesIO(audio.segment(path,0,1,True)),dtype='float32',always_2d=True)
    assert sr==48000 and np.array_equal(data,samples[::-1])


def test_audio_analysis_measures_signal_and_does_not_change_tempo(tmp_path):
    sr=48000
    x=.25*np.sin(2*np.pi*440*np.arange(sr)/sr)
    path=tmp_path/'tone.wav'
    sf.write(path,np.column_stack([x,x]),sr,subtype='FLOAT')
    stats=audio.analyze(path)
    assert stats['peakDb']==pytest.approx(-12.04,abs=.05)
    assert stats['rmsDb'][0]==pytest.approx(-15.05,abs=.05)
    assert stats['clippedSamples']==0
    assert stats['correlation']==pytest.approx(1,abs=1e-6)
    assert stats['lufs'] is not None
    assert any('grid was not changed' in w for w in stats['warnings'])


def test_api_save_restore_auth_and_origin(client):
    created=client.post('/api/projects',json={'name':'Test'}).json()
    changed={**created,'name':'Renamed'}
    r=client.put('/api/projects/'+created['id'],json=changed)
    assert r.status_code==200
    assert client.put('/api/projects/'+created['id'],json=changed).status_code==409
    assert client.post('/api/projects/'+created['id']+'/restore/1').json()['name']=='Test'
    assert client.post('/api/projects',headers={'origin':'https://other.test'},json={'name':'Attack'}).status_code==403
    assert client.get('/health').json()['status']=='ok'


def test_api_rejects_cross_project_assets_and_bad_segments(client):
    p=client.post('/api/projects',json={'name':'One'}).json()
    p['tracks'][0]['clips'][0]['assetId']='foreign'
    assert client.put('/api/projects/'+p['id'],json=p).status_code==422
    assert client.get('/api/assets/nope/segment?duration=300').status_code==422


def test_auth_protects_api_and_websocket(tmp_path,monkeypatch):
    monkeypatch.setenv('DAW_PASSWORD','test-workstation-password')
    with TestClient(create_app(tmp_path/'private',start_worker=False)) as c:
        assert c.get('/api/projects').status_code==401
        assert c.post('/api/auth',json={'password':'bad'}).status_code==401
        assert c.post('/api/auth',json={'password':'test-workstation-password'}).status_code==200
        assert c.get('/api/projects').status_code==200
        with c.websocket_connect('/api/events') as socket:
            assert 'jobs' in socket.receive_json()


def test_runpod_proxy_origin_and_websocket(tmp_path, monkeypatch):
    origin = 'https://testpod-8000.proxy.runpod.net'
    monkeypatch.setenv('DAW_PUBLIC_ORIGIN', origin)
    monkeypatch.setenv('DAW_PASSWORD', 'proxy-password')
    with TestClient(create_app(tmp_path/'proxy', start_worker=False), base_url='https://internal:8000') as c:
        assert c.post('/api/auth', headers={'Origin': origin}, json={'password': 'proxy-password'}).status_code == 200
        created = c.post('/api/projects', headers={'Origin': origin}, json={'name': 'Through proxy'})
        assert created.status_code == 200
        assert c.put('/api/projects/'+created.json()['id'], headers={'Origin': origin}, json=created.json()).status_code == 200
        with c.websocket_connect('wss://internal:8000/api/events', headers={'Origin': origin}) as socket:
            assert 'jobs' in socket.receive_json()
        for bad in ('https://evil.invalid', origin+'.evil.invalid', origin+'/path', 'null', 'http://testpod-8000.proxy.runpod.net'):
            assert c.post('/api/projects', headers={'Origin': bad, 'X-Forwarded-Host': 'evil.invalid'}, json={'name': 'Rejected'}).status_code == 403


def test_runpod_environment_origin(tmp_path, monkeypatch):
    monkeypatch.delenv('DAW_PUBLIC_ORIGIN', raising=False)
    monkeypatch.setenv('RUNPOD_POD_ID', 'testpod')
    with TestClient(create_app(tmp_path/'env-proxy', start_worker=False)) as c:
        assert c.post('/api/projects', headers={'Origin': 'https://testpod-8000.proxy.runpod.net'}, json={'name': 'Pod origin'}).status_code == 200


def test_wav_flac_encoding_preserves_duration(tmp_path):
    source=tmp_path/'float.wav'
    samples=np.random.default_rng(0).normal(0,.02,(48000,2)).astype(np.float32)
    sf.write(source,samples,48000,subtype='FLOAT')
    for fmt in ('wav','flac'):
        dest=tmp_path/f'encoded.{fmt}'
        encode(source,dest,{'sampleRate':44100,'bitDepth':24})
        info=sf.info(dest)
        assert info.samplerate==44100 and info.duration==pytest.approx(1,abs=.001)
        assert info.channels==2 and info.subtype=='PCM_24'


def test_server_export_tail_has_requested_length_and_silent_input_after_region(store,tmp_path):
    p=store.save(Project(tracks=[Track(type='audio',clips=[])]),create=True)
    source=tmp_path/'tail-source.wav';sf.write(source,np.ones((48000,2),dtype=np.float32)*.1,48000)
    asset=audio.ingest(store,p.id,source,'Tail source')
    p.tracks[0].clips=[Clip(assetId=asset['id'],duration=2)];p=store.save(p)
    request=JobRequest(projectId=p.id,kind='export',options={'tailSeconds':2,'format':'wav','sampleRate':48000,'bitDepth':24})
    job={'id':'ef'*16,'projectId':p.id,'kind':'export','state':'Rendering','createdAt':time.time(),'request':request.model_dump(),'projectRevision':p.revision}
    store.put_job(job);render_job(store,job)
    output=store.job(job['id'])['output'];data,rate=sf.read(store.root/'exports'/output)
    assert len(data)/rate==pytest.approx(3,abs=.01)
    assert np.max(np.abs(data[rate+100:]))<1e-5
