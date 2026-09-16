import re
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from backend.app import create_app


def test_every_private_api_route_rejects_anonymous_and_forged_sessions(tmp_path,monkeypatch):
    monkeypatch.setenv('DAW_PASSWORD','private-workstation')
    app=create_app(tmp_path,start_worker=False)
    with TestClient(app) as client:
        routes=[r for r in app.routes if getattr(r,'path','').startswith('/api/') and r.path not in ('/api/auth','/api/session') and getattr(r,'methods',None)]
        assert len(routes)>30
        for route in routes:
            path=re.sub(r'\{[^}]+\}','a'*32,route.path)
            for method in route.methods:
                response=client.request(method,path,headers={'Cookie':'studio_session=forged'})
                assert response.status_code==401,(method,path,response.status_code)
        with pytest.raises(WebSocketDisconnect) as error:
            with client.websocket_connect('/api/events') as socket:socket.receive_json()
        assert error.value.code==1008
        session=client.get('/api/session').json();assert {k:session[k] for k in ('authenticated','passwordRequired')}=={'authenticated':False,'passwordRequired':True};assert re.fullmatch('[a-f0-9]{32}',session['workstationId'])
        assert client.get('/health').status_code==200
        assert client.get('/openapi.json').status_code==404
        assert app.state.store.jobs()==[] and app.state.store.list_projects()==[]


def test_no_password_opens_app_api_and_websocket_but_still_checks_origins(tmp_path,monkeypatch):
    monkeypatch.delenv('DAW_PASSWORD',raising=False)
    with TestClient(create_app(tmp_path,start_worker=False)) as client:
        session=client.get('/api/session').json();assert {k:session[k] for k in ('authenticated','passwordRequired')}=={'authenticated':True,'passwordRequired':False};assert re.fullmatch('[a-f0-9]{32}',session['workstationId'])
        assert client.post('/api/projects',json={'name':'Open project'}).status_code==200
        with client.websocket_connect('/api/events') as socket:assert 'jobs' in socket.receive_json()
        assert client.post('/api/projects',headers={'Origin':'https://foreign.invalid'},json={'name':'Blocked'}).status_code==403


def test_unicode_password_and_authenticated_media_cache_policy(tmp_path,monkeypatch):
    password='Zażółć-gęślą-🔑-private'
    monkeypatch.setenv('DAW_PASSWORD',password)
    with TestClient(create_app(tmp_path,start_worker=False),base_url='https://workstation.test') as client:
        assert client.post('/api/auth',json={'password':'wrong'}).status_code==401
        response=client.post('/api/auth',json={'password':password})
        assert response.status_code==200
        cookie=response.headers['set-cookie'].lower()
        assert 'httponly' in cookie and 'secure' in cookie and 'samesite=strict' in cookie
        assert client.get('/api/projects').status_code==200
        assert client.get('/api/session').json()['passwordRequired']
        # Media requests, including range responses/errors, cannot be cached by a shared proxy.
        response=client.get('/api/assets/'+'a'*32+'/audio',headers={'Range':'bytes=0-99'})
        assert response.status_code==404
        assert response.headers['cache-control']=='private, no-store'
        with client.websocket_connect('wss://workstation.test/api/events') as socket:assert 'jobs' in socket.receive_json()


def test_invalid_login_body_returns_validation_error_not_internal_error(tmp_path,monkeypatch):
    monkeypatch.setenv('DAW_PASSWORD','configured')
    with TestClient(create_app(tmp_path,start_worker=False)) as client:
        for body in ([],{'password':{}},{'password':'x'*4097}):
            assert client.post('/api/auth',json=body).status_code==422
        assert client.get('/api/session').json()['authenticated'] is False
