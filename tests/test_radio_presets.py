import json
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app


def test_saved_station_survives_restart_without_library_audio_or_download_consent(tmp_path):
    sid='a'*32;route='/api/radio/presets/'+sid
    app=create_app(tmp_path,start_worker=False)
    payload={'name':'Japanese nights','settings':{'description':'Dreamy Japanese J-pop','language':'ja','quality':'high','length':'long','model':'Qwen/Qwen3-8B','vocals':'duet'},'revision':0}
    with TestClient(app) as c:
        response=c.put(route,json=payload);assert response.status_code==200
        saved=response.json();assert saved['revision']==1 and saved['settings']==payload['settings']
        assert c.put(route,json=payload).json()==saved
        assert c.get('/api/radio/presets').json()==[saved]
        assert c.get('/api/radio/current').json() is None
        assert c.get('/api/projects').json()==[] and c.get('/api/jobs').json()==[]
        assert not list((tmp_path/'temp'/'radio').glob('*'))
        assert c.put('/api/radio/presets/'+'b'*32,json={**payload,'settings':{**payload['settings'],'approvedDownloads':['writer']}}).status_code==422
    with TestClient(create_app(tmp_path,start_worker=False)) as c:
        assert c.get('/api/radio/presets').json()==[saved]
        renamed=c.put(route,json={**payload,'revision':1,'name':'Evening J-pop'}).json();assert renamed['revision']==2
        assert c.put(route,json={**payload,'revision':1,'name':'Stale rename'}).status_code==409
        assert c.delete(route+'?revision=1').status_code==409
        assert c.delete(route+'?revision=2').status_code==200
        assert c.get('/api/radio/presets').json()==[]
        assert c.get('/api/projects').json()==[]


def test_preset_auth_validation_and_foreign_origin(tmp_path,monkeypatch):
    monkeypatch.setenv('DAW_PASSWORD','radio-preset-test')
    with TestClient(create_app(tmp_path,start_worker=False)) as c:
        route='/api/radio/presets/'+'a'*32;payload={'name':'Focus','settings':{'description':'Calm classical'},'revision':0}
        assert c.get('/api/radio/presets').status_code==401
        assert c.put(route,json=payload).status_code==401
        c.post('/api/auth',json={'password':'radio-preset-test'})
        assert c.put(route,json=payload,headers={'Origin':'https://foreign.invalid'}).status_code==403
        assert c.put(route,json={**payload,'name':'   '}).status_code==422
        assert c.put(route,json={**payload,'settings':{'description':'   '}}).status_code==422
        assert c.put(route,json={**payload,'settings':{'description':'Radio','model':'not-a-writer'}}).status_code==422
        assert c.put(route,json={**payload,'audio':'secret media'}).status_code==422
        assert c.get('/api/radio/presets').json()==[]
