from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from backend.app import create_app
from backend.storage import Store, Conflict
from backend.jobs import Worker
from backend.schema import Project,JobRequest,Generation
from backend.providers import video_alignment


def test_submission_is_atomic_replays_after_restart_and_rejects_changed_intent(tmp_path,monkeypatch):
    store=Store(tmp_path);project=store.save(Project(generation=Generation(style='acoustic')),create=True)
    worker=Worker(store);worker.status['available']=True
    monkeypatch.setattr('backend.model_runtime.check_downloads',lambda *args:None)
    req=JobRequest(projectId=project.id)
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs=list(pool.map(lambda _:worker.enqueue(req,submission_key='same-request-key-123'),range(8)))
    assert len({j['id'] for j in jobs})==1 and len(store.jobs())==1
    other=Worker(Store(tmp_path))
    assert other.enqueue(req,submission_key='same-request-key-123')['id']==jobs[0]['id']
    with pytest.raises(Conflict):worker.enqueue(req.model_copy(update={'candidates':4}),submission_key='same-request-key-123')
    store.patch_job(jobs[0]['id'],state='Failed')
    retried=worker.retry(jobs[0]['id'],submission_key='same-retry-key-12345')
    assert worker.retry(jobs[0]['id'],submission_key='same-retry-key-12345')['id']==retried['id']
    assert len(store.jobs())==1


def test_session_expiry_closes_existing_socket_and_revokes_http(tmp_path,monkeypatch):
    monkeypatch.setenv('DAW_PASSWORD','private-test-password')
    app=create_app(tmp_path,start_worker=False)
    clock=[1000.0];app.state.sessions.clock=lambda:clock[0]
    with TestClient(app) as client:
        assert client.post('/api/auth',json={'password':'private-test-password'}).status_code==200
        with client.websocket_connect('/api/events',headers={'origin':'http://testserver'}) as socket:
            socket.receive_json()
            clock[0]+=8*86400
            with pytest.raises(WebSocketDisconnect) as exc:socket.receive_json()
            assert exc.value.code==1008
        assert client.get('/api/projects').status_code==401
        assert client.post('/api/auth',json={'password':'private-test-password'}).status_code==200
        assert client.post('/api/logout').status_code==200
        assert client.get('/api/projects').status_code==401


def test_workstation_identity_persists_and_is_unique(tmp_path):
    one=Store(tmp_path/'one');assert one.workstation_id()==Store(tmp_path/'one').workstation_id()
    assert one.workstation_id()!=Store(tmp_path/'two').workstation_id()


def test_automatic_video_alignment_selection_matches_capability_and_explicit_choice():
    upgraded={'alignment':{'available':True,'provider':'qwen3'}}
    fallback={'alignment':{'available':True,'provider':'faster-whisper'}}
    assert video_alignment({},'words',upgraded)['backend']=='qwen3'
    assert video_alignment({},'words',fallback)['backend']=='whisper'
    assert video_alignment({'alignmentBackend':'whisper'},'words',upgraded)['backend']=='whisper'
    with pytest.raises(ValueError):video_alignment({'alignmentBackend':'qwen3'},'words',fallback)
