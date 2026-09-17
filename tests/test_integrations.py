"""Authorization and MCP integration tests use an isolated CPU workstation."""
import hashlib,json,re
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.agent_auth import SCOPES,JOB_SCOPE,TokenRequest
from backend import model_runtime as models

@pytest.fixture
def workstation(tmp_path,monkeypatch):
    monkeypatch.setenv('DAW_PASSWORD','integration-test-password')
    monkeypatch.setattr('backend.visual_api.capabilities',lambda:{'text':{'available':True},'artwork':{'available':True},'alignment':{'available':True}})
    spec={**models.MODELS['qwen-1.7B'],'files':[{'path':'config.json','bytes':2},{'path':'weights.safetensors','bytes':3}],'bytes':5}
    monkeypatch.setitem(models.MODELS,'qwen-1.7B',spec)
    app=create_app(tmp_path,start_worker=False)
    with TestClient(app) as client:
        assert client.post('/api/auth',json={'password':'integration-test-password'}).status_code==200
        yield app,client


def token(client,scopes=('read',),name='Test agent'):
    response=client.post('/api/integrations/tokens',json={'name':name,'scopes':list(scopes),'expiresDays':30})
    assert response.status_code==200,response.text
    return response.json()

def bearer(value):return {'Authorization':'Bearer '+value['token']}
def rpc(client,value,method,params=None,ident=1,**headers):
    return client.post('/api/mcp',headers={**bearer(value),'Accept':'application/json, text/event-stream',**headers},json={'jsonrpc':'2.0','id':ident,'method':method,'params':params or {}})
def call(client,value,name,args=None):
    response=rpc(client,value,'tools/call',{'name':name,'arguments':args or {}})
    assert response.status_code==200,response.text
    return response.json()['result']


def test_token_secret_hash_revocation_expiry_and_restart(workstation,monkeypatch):
    app,c=workstation;t=token(c)
    listed=c.get('/api/integrations/tokens').json()
    assert 'token' not in listed[0] and 'digest' not in listed[0]
    with app.state.store.connect() as db:
        row=db.execute('SELECT * FROM agent_tokens').fetchone()
        assert row['digest']==hashlib.sha256(t['token'].encode()).hexdigest()
        assert t['token'] not in str(tuple(row))
    assert c.get('/api/integrations/me',headers=bearer(t)).json()['agent']['name']=='Test agent'
    restarted=create_app(app.state.store.root,start_worker=False)
    with TestClient(restarted) as other:
        assert other.get('/api/projects',headers=bearer(t)).status_code==200
        restarted.state.agents.clock=lambda:t['expiresAt']+1
        assert other.get('/api/projects',headers=bearer(t)).status_code==401
    assert c.delete('/api/integrations/tokens/'+t['id']).status_code==200
    assert c.get('/api/projects',headers=bearer(t)).status_code==401
    t2=token(c);monkeypatch.setenv('DAW_PASSWORD','changed-password')
    with TestClient(create_app(app.state.store.root,start_worker=False)) as other:
        assert other.get('/api/projects',headers=bearer(t2)).status_code==401


def test_invalid_bearer_never_falls_back_to_cookie_or_open_access(workstation,tmp_path,monkeypatch):
    app,c=workstation
    for header in ('Bearer forged','Basic abc','', 'Bearer cdr_'+'x'*48):
        assert c.get('/api/projects',headers={'Authorization':header}).status_code==401
    monkeypatch.delenv('DAW_PASSWORD')
    with TestClient(create_app(tmp_path/'open',start_worker=False)) as opened:
        assert opened.get('/api/projects').status_code==200
        assert opened.get('/api/projects',headers={'Authorization':'Bearer forged'}).status_code==401
        assert opened.post('/api/mcp',json={}).status_code==401
        assert opened.get('/api/integrations/capabilities').json()['auth']['anonymousRestAccess']


def test_reader_cannot_use_any_mutating_route_or_administer_tokens(workstation):
    app,c=workstation;t=token(c)
    for route in app.routes:
        path=getattr(route,'path','')
        if not path.startswith('/api/'):continue
        path=re.sub(r'\{[^}]+\}','a'*32,path)
        for method in getattr(route,'methods',[]):
            if method not in ('POST','PUT','PATCH','DELETE'):continue
            if path=='/api/mcp' or path.startswith('/api/score/') or path.startswith('/api/midi/'):continue
            r=c.request(method,path,headers=bearer(t),json={})
            assert r.status_code==403,(method,path,r.text)
    for path in ('/api/integrations/tokens','/api/integrations/activity','/api/session'):
        assert c.get(path,headers=bearer(t)).status_code==403
    assert app.state.store.jobs()==[]


@pytest.mark.parametrize('kind,scope',list(JOB_SCOPE.items()))
def test_kind_permissions_checked_before_worker(workstation,kind,scope):
    app,c=workstation;t=token(c,['read'])
    r=c.post('/api/jobs',headers=bearer(t),json={'kind':kind,'projectId':'a'*32})
    assert r.status_code==403 and scope in r.json()['detail']['requiredScopes']
    assert not app.state.store.jobs()


def test_download_scope_and_consent_are_both_required(workstation):
    app,c=workstation;p=c.post('/api/projects',json={'name':'Consent fixture'}).json()
    t=token(c,['read','generation:run']);full=token(c,['read','generation:run','models:download'])
    payload={'projectId':p['id'],'kind':'lyrics','options':{'model':'Qwen/Qwen3-1.7B'}}
    denied=c.post('/api/jobs',json=payload,headers=bearer(t))
    assert denied.status_code==428 and denied.json()['detail']['downloadBytes']==5
    assert c.post('/api/jobs',json=payload,headers=bearer(full)).status_code==428
    approved={**payload,'approvedDownloads':['qwen-1.7B']}
    assert c.post('/api/jobs',json=approved,headers=bearer(t)).status_code==403
    assert not app.state.store.jobs()
    response=c.post('/api/jobs',json=approved,headers={**bearer(full),'Idempotency-Key':'same-job-request-0001'})
    assert response.status_code==200,response.text
    assert response.json()['agent']=={'id':full['id'],'name':'Test agent'}
    replay=c.post('/api/jobs',json=approved,headers={**bearer(full),'Idempotency-Key':'same-job-request-0001'})
    assert replay.json()['id']==response.json()['id'] and len(app.state.store.jobs())==1
    different=c.post('/api/jobs',json={**approved,'candidates':2},headers={**bearer(full),'Idempotency-Key':'same-job-request-0001'})
    assert different.status_code==409
    activity=c.get('/api/integrations/activity').json()
    assert any(a['status']==403 for a in activity)
    assert full['token'] not in json.dumps(activity) and 'options' not in json.dumps(activity)


def test_retry_cannot_launder_generation_or_download_permission(workstation):
    app,c=workstation;p=c.post('/api/projects',json={}).json()
    body={'projectId':p['id'],'kind':'lyrics','options':{'model':'Qwen/Qwen3-1.7B'},'approvedDownloads':['qwen-1.7B']}
    job=c.post('/api/jobs',json=body).json()
    app.state.store.patch_job(job['id'],state='Failed')
    t=token(c,['read','jobs:manage'])
    path='/api/jobs/'+job['id']+'/retry'
    response=c.post(path,headers=bearer(t),json={})
    assert response.status_code==403
    assert set(response.json()['detail']['requiredScopes'])=={'read','jobs:manage','generation:run','models:download'}
    assert c.post('/api/jobs/'+job['id']+'/cancel',headers=bearer(t)).status_code==200


def test_agent_project_revision_and_creation_idempotency(workstation):
    app,c=workstation;t=token(c,['read','projects:write'])
    h={**bearer(t),'Idempotency-Key':'project-create-0000001'}
    p=c.post('/api/projects',json={'name':'Original'},headers=h).json()
    assert c.post('/api/projects',json={'name':'Original'},headers=h).json()['id']==p['id']
    assert c.post('/api/projects',json={'name':'Other'},headers=h).status_code==409
    before=json.loads(json.dumps(p));gen={**p['generation'],'style':'Japanese jazz duet','lyrics':'テスト'}
    result=c.patch('/api/projects/'+p['id']+'/generation',headers=bearer(t),json={'revision':p['revision'],'generation':gen})
    assert result.status_code==200,result.text
    updated=result.json()
    for field in ('tracks','chords','visuals','candidates','creative'):assert updated[field]==before[field]
    assert c.patch('/api/projects/'+p['id']+'/generation',headers=bearer(t),json={'revision':p['revision'],'generation':gen}).status_code==409
    assert c.post('/api/projects',json={'name':'Original'},headers=h).json()['generation']==gen
    t2=token(c,['read','projects:write'])
    other=c.post('/api/projects',json={'name':'Original'},headers={**bearer(t2),'Idempotency-Key':'project-create-0000001'}).json()
    assert other['id']!=p['id']


def test_mcp_protocol_tools_resources_and_no_browser_fallback(workstation):
    app,c=workstation;t=token(c,['read','projects:write'])
    assert c.post('/api/mcp',json={}).status_code==401
    init=rpc(c,t,'initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'test','version':'1'}}).json()['result']
    assert init['protocolVersion']=='2025-11-25' and init['capabilities']['tools']
    assert c.post('/api/mcp',headers={**bearer(t),'Accept':'application/json, text/event-stream'},json={'jsonrpc':'2.0','method':'notifications/initialized'}).status_code==202
    assert c.get('/api/mcp',headers=bearer(t)).status_code==405
    assert c.delete('/api/mcp',headers=bearer(t)).status_code==405
    assert rpc(c,t,'ping',**{'MCP-Protocol-Version':'unknown'}).status_code==400
    assert rpc(c,t,'ping',Origin='https://foreign.invalid').status_code==403
    assert c.get('/api/mcp',headers={**bearer(t),'Origin':'https://foreign.invalid'}).status_code==403
    tools=rpc(c,t,'tools/list').json()['result']['tools']
    assert len(tools)>=30 and len({v['name'] for v in tools})==len(tools)
    assert all('inputSchema' in v and '_path' not in v for v in tools)
    result=call(c,t,'create_project',{'name':'MCP project','requestId':'mcp-create-00000001'})
    assert result['isError'] is False
    p=result['structuredContent']['data']
    assert call(c,t,'get_project',{'projectId':p['id']})['structuredContent']['data']['id']==p['id']
    forbidden=call(c,t,'generate_music',{'projectId':p['id'],'requestId':'mcp-generate-00001'})
    assert forbidden['isError'] and forbidden['structuredContent']['status']==403
    assert call(c,t,'get_project',{'projectId':'../../api/auth'})['structuredContent']['status']==422
    resources=rpc(c,t,'resources/list').json()['result']['resources']
    for resource in resources:
        got=rpc(c,t,'resources/read',{'uri':resource['uri']}).json()['result']['contents'][0]
        assert got['text'] and got['mimeType']
    prompt=rpc(c,t,'prompts/get',{'name':'create-song','arguments':{'request':'Japanese instrumental jazz'}}).json()['result']
    assert 'Japanese instrumental jazz' in prompt['messages'][0]['content']['text']
    assert rpc(c,t,'unknown').json()['error']['code']==-32601
    assert rpc(c,t,'tools/call',{'name':'unknown'}).json()['error']['code']==-32602


def test_mcp_download_error_and_queue_replay(workstation):
    app,c=workstation;t=token(c,['read','generation:run','models:download','jobs:manage'])
    p=c.post('/api/projects',json={}).json()
    args={'projectId':p['id'],'requestId':'mcp-lyrics-request-01','options':{'model':'Qwen/Qwen3-1.7B','style':'Japanese pop'}}
    missing=call(c,t,'generate_lyrics',args)
    assert missing['structuredContent']['status']==428 and missing['isError']
    accepted=call(c,t,'generate_lyrics',{**args,'approvedDownloads':['qwen-1.7B']})
    assert accepted['structuredContent']['status']==200,accepted
    job=accepted['structuredContent']['data']
    assert job['request']['options']['language']=='ja'
    assert call(c,t,'generate_lyrics',{**args,'approvedDownloads':['qwen-1.7B']})['structuredContent']['data']['id']==job['id']
    assert call(c,t,'get_job',{'jobId':job['id']})['structuredContent']['data']['state']=='Queued'
    assert call(c,t,'cancel_job',{'jobId':job['id']})['structuredContent']['data']['state']=='Cancelled'
    assert len(app.state.store.jobs())==1


def test_openapi_valid_references_and_security_contract(workstation):
    app,c=workstation;schema=c.get('/api/openapi.json').json()
    assert schema['openapi'].startswith('3.1')
    assert 'AgentToken' in schema['components']['securitySchemes']
    assert schema['paths']['/api/integrations/tokens']['post']['security']==[{'BrowserSession':[]}]
    assert '428' in schema['paths']['/api/jobs']['post']['responses']
    assert 'TextOptions' in schema['components']['schemas']
    def walk(value):
        if isinstance(value,dict):
            if '$ref' in value:
                pointer=value['$ref'];assert pointer.startswith('#/')
                node=schema
                for part in pointer[2:].split('/'):node=node[part]
            for item in value.values():walk(item)
        if isinstance(value,list):
            for item in value:walk(item)
    walk(schema)


def test_token_validation_limits_and_agent_json_bounds(workstation):
    app,c=workstation
    for body in ({'name':' ','scopes':['read']},{'name':'Agent','scopes':['owner']},{'name':'Agent','scopes':['read'],'expiresDays':0}):
        assert c.post('/api/integrations/tokens',json=body).status_code==422
    t=token(c,['read','projects:write'])
    oversized=c.post('/api/projects',headers=bearer(t),json={'name':'x'*(4*1024*1024)})
    assert oversized.status_code==413
    assert c.get('/api/jobs/'+'a'*32,headers=bearer(t)).status_code==404
    assert c.get('/api/jobs',headers=bearer(t)).headers['cache-control']=='private, no-store'

@pytest.mark.parametrize('media',['application/json','application/problem+json','Application/JSON',''])
def test_json_content_types_cannot_bypass_job_scopes(workstation,media):
    app,c=workstation;t=token(c,['read','generation:run'])
    headers=bearer(t)
    if media:headers['Content-Type']=media
    r=c.post('/api/jobs',headers=headers,content=json.dumps({'kind':'model-download','projectId':'a'*32,'options':{'modelId':'qwen-1.7B'},'approvedDownloads':['qwen-1.7B']}))
    assert r.status_code==403
    assert not app.state.store.jobs()


def test_mcp_malformed_messages_are_protocol_errors(workstation):
    app,c=workstation;t=token(c)
    h={**bearer(t),'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
    assert c.post('/api/mcp',headers=h,content='{').json()['error']['code']==-32700
    for message in ([],{'jsonrpc':'2.0','method':'ping','id':None},{'jsonrpc':'2.0','method':'ping','id':True}):
        assert c.post('/api/mcp',headers=h,json=message).json()['error']['code']==-32600
    assert rpc(c,t,'tools/call',{'name':[]}).json()['error']['code']==-32602
    assert c.get('/api/projects',headers=bearer(t)).status_code==200


def test_runpod_companion_discovery_download_and_auth(workstation):
    from backend.runpod_guide import SKILL_PATH
    app,c=workstation
    t=token(c)
    caps=c.get('/api/integrations/capabilities',headers=bearer(t)).json()
    spec=caps['integrations']['runpod']
    direct=c.get(spec['guidePath'],headers=bearer(t)).json()
    tool=call(c,t,spec['tool'])
    assert not tool['isError'] and tool['structuredContent']['data']==direct
    resource=rpc(c,t,'resources/read',{'uri':spec['resourceUri']}).json()['result']['contents'][0]
    assert json.loads(resource['text'])==direct
    download=c.get(spec['skillPath'],headers=bearer(t))
    assert download.status_code==200
    assert download.text==direct['text']==SKILL_PATH.read_text(encoding='utf-8')
    assert download.headers['content-disposition']=='attachment; filename="SKILL.md"'
    assert download.headers['content-type'].startswith('text/markdown')
    assert t['token'] not in json.dumps(direct)
    assert c.get('/api/jobs').json()==[]
    assert c.get('/api/projects').json()==[]
    schema=c.get('/api/openapi.json').json()
    for path in (spec['guidePath'],spec['skillPath']):
        assert schema['paths'][path]['get']['x-agent-scopes']==['read']
        assert c.get(path,headers={'Authorization':'Bearer invalid'}).status_code==401
    c.cookies.clear()
    for path in (spec['guidePath'],spec['skillPath']):
        assert c.get(path).status_code==401


def test_reconnect_kit_keeps_identity_across_restart_without_credentials(workstation,tmp_path):
    import io
    from zipfile import ZipFile
    from backend.runpod_guide import reconnect_kit
    from backend.storage import Store
    app,c=workstation
    t=token(c)
    response=c.get('/api/integrations/runpod/reconnect.zip',headers=bearer(t))
    assert response.status_code==200 and response.headers['content-type']=='application/zip'
    assert 'no-store' in response.headers['cache-control'].split(', ')
    with ZipFile(io.BytesIO(response.content)) as archive:
        assert set(archive.namelist())=={'cadentrail-runpod/SKILL.md','cadentrail-runpod/references/connection.json'}
        assert archive.testzip() is None
        profile=json.loads(archive.read('cadentrail-runpod/references/connection.json'))
        assert profile['expectedWorkstationId']==app.state.store.workstation_id()
        assert profile['serverName']=='cadentrail' and profile['mcpPath']=='/api/mcp'
        assert set(profile)=={'schemaVersion','serverName','expectedWorkstationId','imageRepository','httpPort','mcpPath','healthPath','identityPath','identityField'}
        assert t['token'] not in str(profile)
        source=archive.read('cadentrail-runpod/SKILL.md').decode()
        assert 'references/connection.json' in source
    with ZipFile(io.BytesIO(reconnect_kit(Store(app.state.store.root).workstation_id()))) as archive:
        assert json.loads(archive.read('cadentrail-runpod/references/connection.json'))==profile
    assert Store(tmp_path/'fresh-workstation').workstation_id()!=profile['expectedWorkstationId']
    assert c.get('/api/integrations/runpod/reconnect.zip',headers={'Authorization':'Bearer invalid'}).status_code==401
    c.cookies.clear()
    assert c.get('/api/integrations/runpod/reconnect.zip').status_code==401


def test_agents_receive_the_real_generation_boundary_and_invalid_scores_do_not_queue(workstation):
    app, client = workstation
    agent = token(client, ['read', 'projects:write', 'generation:run'])
    data = call(client, agent, 'get_capabilities')['structuredContent']['data']
    assert data['music']['generationOutput'] == 'complete-stereo-take'
    assert data['music']['independentInstrumentGeneration'] is False
    assert data['music']['arrangementControlsGeneration'] is False
    assert data['music']['exactMidiReproductionGuaranteed'] is False
    assert 'ABC' in data['music']['midiReference']
    project = client.post('/api/projects', json={'name': 'Reference validation'}).json()
    for kind in ('generate', 'plan'):
        for abc, cot in (('', 'full'), ('X:1\nK:C\nC D', 'off')):
            g = {**project['generation'], 'style': 'Jazz', 'abc': abc, 'cot': cot, 'useScore': True}
            response = client.post('/api/jobs', headers=bearer(agent), json={'kind': kind, 'projectId': project['id'], 'generation': g})
            assert response.status_code == 422, response.text
            assert 'nonempty ABC' in response.text
    assert app.state.store.jobs() == []


def test_direct_generation_does_not_queue_a_score_only_job(workstation):
    app, client = workstation
    p = client.post('/api/projects', json={'name': 'Direct generation'}).json()
    response = client.post('/api/jobs', json={'kind': 'plan', 'projectId': p['id'], 'generation': {**p['generation'], 'style': 'Jazz', 'cot': 'off', 'useScore': False}})
    assert response.status_code == 422 and 'Score planning is off' in response.text
    assert app.state.store.jobs() == []
