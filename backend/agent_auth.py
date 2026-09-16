"""Persistent, revocable agent credentials. Browser access retains its existing policy."""
from __future__ import annotations
import hashlib, hmac, json, re, secrets, time
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from fastapi import HTTPException

SCOPES = {
    'read': ('Read workstation', 'Read all projects, lyrics, media, files, jobs and model status.'),
    'projects:write': ('Edit projects', 'Create, edit, duplicate, restore revisions, import media and organize the library.'),
    'generation:run': ('Generate music & lyrics', 'Queue YuE2 takes, score plans and writing assistance. Uses GPU time.'),
    'audio:process': ('Process & export audio', 'Separate stems, align lyrics, tokenize audio, master and export mixes.'),
    'visuals:render': ('Create visuals', 'Generate artwork, design covers and render videos. Automatic video may also align lyrics.'),
    'jobs:manage': ('Manage jobs', 'Cancel, reprioritize or retry any job, including jobs started in the browser. Retry also requires its operation permission.'),
    'models:download': ('Download models', 'Download optional models only when their IDs are explicitly approved in the request.'),
    'radio:manage': ('Control live Radio', 'Start, retune, stop or retry the shared Radio station and edit station presets.'),
}
Scope = Literal['read','projects:write','generation:run','audio:process','visuals:render','jobs:manage','models:download','radio:manage']
JOB_SCOPE = {**dict.fromkeys(('generate','plan','lyrics'),'generation:run'),
             **dict.fromkeys(('separate','align','tokenize','master','export'),'audio:process'),
             **dict.fromkeys(('artwork','cover','video','music-video'),'visuals:render'),
             'model-download':'models:download'}

class TokenRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=1,max_length=80)
    scopes: list[Scope] = Field(min_length=1,max_length=8)
    expiresDays: Literal[1,7,30,90,365] = 30

class AgentTokens:
    def __init__(self,store,password):
        self.store = store
        self.clock = time.time
        with store.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS agent_tokens(
                  id TEXT PRIMARY KEY, name TEXT NOT NULL, digest TEXT UNIQUE NOT NULL,
                  scopes TEXT NOT NULL, created REAL NOT NULL, expires REAL NOT NULL,
                  last_used REAL, revoked REAL);
                CREATE TABLE IF NOT EXISTS agent_activity(
                  id INTEGER PRIMARY KEY AUTOINCREMENT, token_id TEXT NOT NULL, name TEXT NOT NULL,
                  created REAL NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL);
            ''')
            db.execute("INSERT OR IGNORE INTO metadata VALUES('agent_salt',?)",(secrets.token_hex(32),))
            salt=db.execute("SELECT value FROM metadata WHERE key='agent_salt'").fetchone()[0]
            epoch=hmac.new(salt.encode(),password.encode(),hashlib.sha256).hexdigest()
            old=db.execute("SELECT value FROM metadata WHERE key='agent_epoch'").fetchone()
            if old and not hmac.compare_digest(old[0],epoch):
                db.execute('UPDATE agent_tokens SET revoked=? WHERE revoked IS NULL',(self.clock(),))
            db.execute("INSERT OR REPLACE INTO metadata VALUES('agent_epoch',?)",(epoch,))

    @staticmethod
    def public(row):
        return {'id':row['id'],'name':row['name'],'scopes':json.loads(row['scopes']),
                'createdAt':row['created'],'expiresAt':row['expires'],'lastUsedAt':row['last_used'],'revokedAt':row['revoked']}

    def list(self):
        with self.store.connect() as db:
            return [self.public(row) for row in db.execute('SELECT * FROM agent_tokens ORDER BY created DESC LIMIT 200')]

    def issue(self,data:TokenRequest):
        now=self.clock(); token='cdr_'+secrets.token_urlsafe(36); ident=secrets.token_hex(16)
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT COUNT(*) FROM agent_tokens WHERE revoked IS NULL AND expires>?',(now,)).fetchone()[0]>=32:
                raise ValueError('Revoke an unused token first. Up to 32 active tokens are supported.')
            db.execute('INSERT INTO agent_tokens VALUES(?,?,?,?,?,?,NULL,NULL)',
                       (ident,data.name,hashlib.sha256(token.encode()).hexdigest(),json.dumps(sorted(set(data.scopes)|{'read'})),now,now+data.expiresDays*86400))
            db.execute('DELETE FROM agent_tokens WHERE id NOT IN (SELECT id FROM agent_tokens ORDER BY created DESC LIMIT 200) AND (revoked IS NOT NULL OR expires<=?)',(now,))
            row=db.execute('SELECT * FROM agent_tokens WHERE id=?',(ident,)).fetchone()
        return {**self.public(row),'token':token}

    def authenticate(self,header):
        match=re.fullmatch(r'Bearer (cdr_[A-Za-z0-9_-]{48})',header,re.IGNORECASE)
        if not match:return None
        digest=hashlib.sha256(match[1].encode()).hexdigest(); now=self.clock()
        with self.store.connect() as db:
            row=db.execute('SELECT * FROM agent_tokens WHERE digest=? AND revoked IS NULL AND expires>?',(digest,now)).fetchone()
            if not row:return None
            # Throttle bookkeeping writes during polling, without caching authorization.
            if row['last_used'] is None or now-row['last_used']>=60:
                db.execute('UPDATE agent_tokens SET last_used=? WHERE id=?',(now,row['id']))
            return self.public(row)

    def revoke(self,ident):
        with self.store.connect() as db:
            if not db.execute('UPDATE agent_tokens SET revoked=COALESCE(revoked,?) WHERE id=?',(self.clock(),ident)).rowcount:
                raise KeyError('Token not found')
        return {'revoked':True}

    def record(self,agent,method,path,status):
        # No prompts, request/response bodies, query strings or credentials in this log.
        with self.store.connect() as db:
            db.execute('INSERT INTO agent_activity(token_id,name,created,method,path,status) VALUES(?,?,?,?,?,?)',
                       (agent['id'],agent['name'],self.clock(),method,path[:300],status))
            db.execute('DELETE FROM agent_activity WHERE id <= (SELECT COALESCE(MAX(id),0)-2000 FROM agent_activity)')

    def activity(self):
        with self.store.connect() as db:
            return [dict(row) for row in db.execute('SELECT * FROM agent_activity ORDER BY id DESC LIMIT 100')]


def required_scopes(method,path,body=None,store=None):
    """Fail closed for all unclassified writes, including newly introduced routes."""
    body=body if isinstance(body,dict) else {}
    if path.startswith('/api/integrations/tokens') or path=='/api/integrations/activity' or path in ('/api/auth','/api/logout','/api/session'):
        return {'owner'}
    if path=='/api/mcp':return set()  # Each MCP tool crosses this same REST gate.
    if method in ('GET','HEAD'):
        if re.fullmatch(r'/api/projects/[^/]+/portable',path):return {'read','audio:process'}
        return {'read'}
    extra={'models:download'} if body.get('approvedDownloads') else set()
    if path=='/api/jobs' and method=='POST':
        return {'read',JOB_SCOPE.get(body.get('kind','generate'),'owner')}|extra
    if re.fullmatch(r'/api/jobs/[^/]+/retry',path) and method=='POST':
        if store is None:return {'read','jobs:manage'}
        try:old=store.job(path.split('/')[3])
        except KeyError:return {'read','jobs:manage'}|extra
        approved=old.get('request',{}).get('approvedDownloads')
        return {'read','jobs:manage',JOB_SCOPE.get(old['kind'],'owner')}|extra|({'models:download'} if approved else set())
    if re.fullmatch(r'/api/jobs/[^/]+/(cancel|priority)',path) and method=='POST':return {'read','jobs:manage'}
    if path.startswith('/api/radio') and method in ('POST','PUT','DELETE'):return {'read','radio:manage'}|extra
    patterns = {
        'projects:write': [('POST',r'/api/projects'),('POST',r'/api/projects/import-portable'),('PUT',r'/api/projects/[^/]+'),
            ('PATCH',r'/api/projects/[^/]+/generation'),('POST',r'/api/projects/[^/]+/(duplicate|import|restore/\d+|visuals/import)'),
            ('PATCH',r'/api/projects/[^/]+/files/[^/]+'),('PATCH',r'/api/library/tracks/[^/]+')],
        'audio:process': [('POST',r'/api/assets/[^/]+/process'),('POST',r'/api/projects/[^/]+/rendered')],
        'visuals:render': [('POST',r'/api/projects/[^/]+/cover-preview')],
        'read': [('POST',r'/api/(score/(parse|write)|midi/(import|export))')],
    }
    for scope,items in patterns.items():
        if any(method==verb and re.fullmatch(pattern,path) for verb,pattern in items):return {'read',scope}
    return {'owner'}

async def enforce_agent(request,agent,store):
    body=None
    media=request.headers.get('content-type','').split(';')[0].strip().lower()
    json_body=not media or media=='application/json' or (media.startswith('application/') and media.endswith('+json'))
    if request.method in ('POST','PUT','PATCH') and json_body:
        # Bound agent JSON input, including project edits. Media uses existing upload limits.
        chunks=[]; size=0
        async for chunk in request.stream():
            size+=len(chunk)
            if size>4*1024*1024:raise HTTPException(413,'Agent JSON requests must be at most 4 MiB')
            chunks.append(chunk)
        request._body=b''.join(chunks)
        try:body=json.loads(request._body) if request._body else None
        except (ValueError,UnicodeDecodeError):
            if request.url.path!='/api/mcp':raise HTTPException(422,'Invalid JSON body')
    needed=required_scopes(request.method,request.url.path,body,store)
    if not needed.issubset(agent['scopes']):
        raise HTTPException(403,{'code':'insufficient_scope','requiredScopes':sorted(needed),'message':'This token does not permit this operation.'})


def submission_key(request):
    key=request.headers.get('Idempotency-Key')
    agent=getattr(request.state,'agent',None)
    if agent and key:
        if not re.fullmatch(r'[A-Za-z0-9_-]{16,128}',key):raise ValueError('Invalid submission key')
        return hashlib.sha256((agent['id']+':'+key).encode()).hexdigest()
    return key
