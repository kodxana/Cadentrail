from __future__ import annotations
import asyncio
import contextlib
import hmac
import io
import json
import os
import re
import secrets
import shutil
import time
import zipfile
from urllib.parse import urlsplit
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from .version import VERSION
from .schema import Project, Track, Clip, JobRequest, uid
from .storage import Store, Conflict
from .jobs import Worker
from .model_runtime import ModelDownloadRequired, model_inventory
from . import audio, score

from .integrations import CreateProject

class LoginRequest(BaseModel):
    password: str = Field(default="", max_length=4096)

class RetryRequest(BaseModel):
    approvedDownloads: list[str] = Field(default_factory=list,max_length=16)

def create_app(root: Path | None = None, start_worker=True):
    root = root or Path(os.getenv("DAW_STORAGE", "/workspace/yue2-daw" if os.name != "nt" else ".data"))
    store = Store(root)
    worker = Worker(store)
    from .sessions import Sessions
    sessions = Sessions()
    password = os.getenv("DAW_PASSWORD", "")
    # Runpod can rewrite Host before forwarding. Trust only an operator-configured
    # public origin (or this Pod's deterministic proxy origin), never arbitrary
    # X-Forwarded-Host values supplied by a client.
    public_origins = {v.strip().rstrip('/') for v in os.getenv('DAW_PUBLIC_ORIGIN', '').split(',') if v.strip()}
    pod_id = os.getenv('RUNPOD_POD_ID', '')
    if pod_id and all(c.isalnum() for c in pod_id):
        public_origins.add(f'https://{pod_id}-{os.getenv("PORT", "8000")}.proxy.runpod.net')

    def valid_origin(origin, host, scheme):
        if not origin:
            return True  # Non-browser clients still require authentication.
        try:parsed = urlsplit(origin)
        except ValueError:return False
        if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.path not in ('', '/') or parsed.query or parsed.fragment or parsed.username:
            return False
        normalized = f'{parsed.scheme}://{parsed.netloc}'.lower()
        direct_scheme = {'ws': 'http', 'wss': 'https'}.get(scheme, scheme)
        return normalized in {v.lower() for v in public_origins} or normalized == f'{direct_scheme}://{host}'.lower()

    @contextlib.asynccontextmanager
    async def lifespan(app):
        if start_worker:
            worker.start()
        yield
        worker.stop()

    app = FastAPI(title="Cadentrail — A DAW for YuE2", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store, app.state.worker = store, worker
    app.state.sessions = sessions
    from .agent_auth import AgentTokens, enforce_agent
    agents = AgentTokens(store, password)
    app.state.agents = agents

    def authorized(cookie):
        return not password or sessions.allowed(cookie)

    @app.middleware("http")
    async def security(request: Request, call_next):
        path = request.url.path
        agent = None
        if path.startswith('/api/'):
            header=request.headers.get('authorization')
            if header is not None:
                agent=await run_in_threadpool(agents.authenticate,header)
                if not agent:
                    return JSONResponse({'detail':'Invalid, expired or revoked agent token'},status_code=401,headers={'WWW-Authenticate':'Bearer','Cache-Control':'private, no-store'})
                request.state.agent=agent
                try:await enforce_agent(request,agent,store)
                except HTTPException as exc:
                    await run_in_threadpool(agents.record,agent,request.method,path,exc.status_code)
                    return JSONResponse({'detail':exc.detail},status_code=exc.status_code,headers={'Cache-Control':'private, no-store'})
            elif path not in ('/api/auth','/api/session') and not authorized(request.cookies.get('studio_session')):
                return JSONResponse({'detail':'Sign in to your workstation'},status_code=401,headers={'Cache-Control':'private, no-store'})
            if path=='/api/mcp' and not agent:
                return JSONResponse({'detail':'Connect MCP with an agent Bearer token'},status_code=401,headers={'WWW-Authenticate':'Bearer'})
        if request.method not in ('GET','HEAD','OPTIONS') or path=='/api/mcp':
            if not valid_origin(request.headers.get('origin'),request.headers.get('host'),request.url.scheme):
                return JSONResponse({'detail':'Cross-origin writes are not allowed'},status_code=403)
        response = await call_next(request)
        if agent and request.method not in ('GET','HEAD','OPTIONS') and path!='/api/mcp':
            await run_in_threadpool(agents.record,agent,request.method,path,response.status_code)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if path.startswith('/api/'):
            response.headers["Cache-Control"] = "private, no-store"
        return response

    @app.exception_handler(ModelDownloadRequired)
    async def download_required(_, exc):
        return JSONResponse({'detail':exc.detail},status_code=428)

    @app.get('/api/models')
    def models():
        return model_inventory(store.root)

    @app.exception_handler(Conflict)
    async def conflict(_, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(ValueError)
    async def invalid(_, exc):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(KeyError)
    async def missing(_, exc):
        return JSONResponse({"detail": str(exc).strip("'")}, status_code=404)

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "cadentrail", "schemaVersion": 2, "version": VERSION}

    @app.get("/api/session")
    def session(request: Request):
        return {"authenticated": authorized(request.cookies.get("studio_session")), "passwordRequired": bool(password), "workstationId":store.workstation_id()}

    @app.post("/api/auth")
    async def login(data: LoginRequest, request: Request):
        host = request.client.host if request.client else "unknown"
        sessions.attempt(host)
        if not hmac.compare_digest(data.password.encode("utf-8"), password.encode("utf-8")):
            raise HTTPException(401, "Incorrect workstation password")
        token = sessions.issue(request.cookies.get('studio_session'))
        response = JSONResponse({"ok": True})
        response.set_cookie("studio_session", token, httponly=True, samesite="strict", secure=request.url.scheme == "https", max_age=86400*7)
        return response

    @app.post('/api/logout')
    def logout(request: Request):
        sessions.revoke(request.cookies.get('studio_session'))
        response = JSONResponse({'ok':True})
        response.delete_cookie('studio_session', httponly=True, samesite='strict', secure=request.url.scheme == 'https')
        return response

    @app.get("/api/gpu")
    def gpu():
        from .gpu import gpu_status
        return gpu_status()

    @app.get("/api/status")
    def status():
        import importlib.util
        from .storage_usage import storage_usage
        storage=storage_usage(root)
        return {**worker.status, "queue": sum(j["state"] == "Queued" for j in store.jobs()), "storage":storage, "storageFreeGb": round(storage['availableBytes']/1e9,1) if storage['availableBytes'] is not None else None, "modelName": "m-a-p/YuE2-3B", "vae": "m-a-p/YuE2-Vae", "quantization": "none", "stemsAvailable": importlib.util.find_spec("demucs") is not None, "license": "CC BY-NC 4.0", "roleStatus": "Uncalibrated style guidance"}

    @app.get("/api/projects")
    def projects():
        return store.list_projects()

    @app.post('/api/projects', response_model=Project)
    def create(data:CreateProject, request:Request):
        from .agent_auth import submission_key
        import hashlib
        key=submission_key(request)
        if key:
            from .submissions import identity
            identity('project',key,{})
        project = Project(name=data.name,tempo=data.tempo,tracks=[Track(name='Melody',type='midi',clips=[Clip(name='Composition',duration=16)])])
        if key:project.id=hashlib.sha256((store.workstation_id()+':project:'+key).encode()).hexdigest()[:32]
        with worker.submission_lock:
            if key:
                with store.connect() as db:
                    row=db.execute('SELECT data FROM revisions WHERE project_id=? AND revision=1',(project.id,)).fetchone()
                if row:
                    original=Project.model_validate_json(row[0])
                    if original.name!=data.name or original.tempo!=data.tempo:raise Conflict('This request ID was used for another project creation.')
                    return store.load(project.id)
            return store.save(project,'Created project',create=True)

    @app.post("/api/projects/import-portable")
    async def restore_portable(file: UploadFile = File(...)):
        from .portable import import_portable
        target = store.root / 'temp' / (uid()+'.zip')
        try:
            size = 0
            with open(target,'wb') as f:
                while chunk := await file.read(1024*1024):
                    size += len(chunk)
                    if size > 4*1024**3: raise ValueError('Portable archive exceeds 4 GB')
                    f.write(chunk)
            return await run_in_threadpool(import_portable,store,target)
        finally:
            target.unlink(missing_ok=True)

    @app.get("/api/projects/{project_id}")
    def get_project(project_id: str):
        return store.load(project_id)

    @app.put("/api/projects/{project_id}")
    def save_project(project_id: str, project: Project):
        if project.id != project_id:
            raise ValueError("Project id does not match URL")
        allowed = {a["id"] for a in store.assets(project_id)}
        if any(c.assetId and c.assetId not in allowed for t in project.tracks for c in t.clips):
            raise ValueError("Clip references an asset outside this project")
        if project.generation.hum:
            from .hum_song import check_source
            check_source(store, project.id, project.generation.hum)
        return store.save(project, "Autosave")

    @app.post("/api/projects/{project_id}/duplicate")
    def duplicate(project_id: str):
        original = store.load(project_id)
        clone = original.model_copy(deep=True)
        clone.id, clone.revision, clone.createdAt = uid(), 0, time.time()
        clone.name += " copy"
        source, target = store.project_dir(project_id), store.project_dir(clone.id)
        shutil.copytree(source, target, dirs_exist_ok=True)
        assets=store.assets(project_id)
        mapping={asset['id']:uid() for asset in assets}
        for asset in assets:
            old = asset["id"]
            asset["id"] = mapping[old]
            if isinstance(asset.get('lineage'),dict):
                asset['lineage']['sourceAssetIds']=[mapping.get(i,i) for i in asset['lineage'].get('sourceAssetIds',[])]
            # Files retain their original names; references are explicit.
            store.add_asset(clone.id, asset)
        for t in clone.tracks:
            for c in t.clips:
                c.assetId = mapping.get(c.assetId, c.assetId)
        for c in clone.candidates:
            c.assetId = mapping.get(c.assetId, c.assetId)
        from .visual_api import remap_visual_audio
        remap_visual_audio(clone,mapping)
        from .hum_song import remap_hum_sources
        remap_hum_sources(clone,mapping)
        return store.save(clone, "Duplicated project", create=True)

    @app.get("/api/projects/{project_id}/revisions")
    def revisions(project_id: str):
        with store.connect() as db:
            return [dict(r) for r in db.execute("SELECT revision,label,created FROM revisions WHERE project_id=? ORDER BY revision DESC LIMIT 200", (project_id,))]

    @app.post("/api/projects/{project_id}/restore/{revision}")
    def restore(project_id: str, revision: int):
        with store.connect() as db:
            row = db.execute("SELECT data FROM revisions WHERE project_id=? AND revision=?", (project_id, revision)).fetchone()
        if not row:
            raise KeyError("Revision not found")
        p = Project.model_validate_json(row[0])
        p.revision = store.load(project_id).revision
        return store.save(p, f"Restored revision {revision}")

    @app.get("/api/projects/{project_id}/assets")
    def assets(project_id: str):
        return store.assets(project_id)

    @app.post("/api/projects/{project_id}/import")
    async def upload(project_id: str, file: UploadFile = File(...)):
        store.load(project_id)
        extension = Path(file.filename or "").suffix.lower()
        if extension not in (".wav", ".flac", ".mp3", ".aac", ".ogg", ".opus", ".m4a", ".webm"):
            raise ValueError("Supported audio: WAV, FLAC, MP3, AAC, OGG, Opus, M4A and WebM")
        dest = store.project_dir(project_id) / "audio" / (uid() + "-original" + extension)
        total = 0
        try:
            with open(dest, "wb") as f:
                while chunk := await file.read(1024*1024):
                    total += len(chunk)
                    if total > 2 * 1024**3:
                        raise ValueError("Maximum upload size is 2 GB")
                    f.write(chunk)
            return await run_in_threadpool(audio.ingest, store, project_id, dest, file.filename or "Recording")
        except Exception:
            dest.unlink(missing_ok=True)
            raise

    @app.get("/api/assets/{asset_id}/audio")
    def asset_audio(asset_id: str):
        from .catalog import filename
        return FileResponse(store.asset_path(asset_id), media_type="audio/wav",filename=filename(store.asset(asset_id)['name'],'wav'),content_disposition_type='inline')

    @app.get("/api/assets/{asset_id}/segment")
    def asset_segment(asset_id: str, start: float = 0, duration: float = 8, reverse: bool = False):
        if not 0 <= start <= 86400 or not 0 < duration <= 16:
            raise ValueError("Segment must be 0–16 seconds at a nonnegative offset")
        return Response(audio.segment(store.asset_path(asset_id), start, duration, reverse), media_type="audio/wav", headers={"Cache-Control": "private, max-age=86400"})

    @app.get("/api/assets/{asset_id}/peaks")
    def peaks(asset_id: str, points: int = 2000):
        a = store.asset(asset_id)
        levels = a["peaks"]["levels"]
        level = min(levels, key=lambda l: abs(l["length"]-max(128, min(points, 50000))))
        return FileResponse(store.project_dir(a["projectId"]) / "waveforms" / level["file"], media_type="application/json")

    @app.get("/api/assets/{asset_id}/spectrogram")
    def spec(asset_id: str):
        a = store.asset(asset_id)
        # Original filename is derived from the canonical WAV, supporting copied projects.
        return FileResponse(store.project_dir(a["projectId"]) / "spectrograms" / (Path(a["path"]).stem + ".png"), media_type="image/png")

    @app.post("/api/assets/{asset_id}/process")
    def process_audio(asset_id: str, options: dict):
        a = store.asset(asset_id)
        source = store.asset_path(asset_id)
        dest = store.project_dir(a["projectId"]) / "renders" / (uid() + ".wav")
        op = options.get("operation")
        filters = {"reverse": "areverse", "normalize": "loudnorm=I=-16:TP=-1:LRA=11", "silence": "volume=0", "dc": "highpass=f=10"}
        if op not in filters:
            raise ValueError("Unsupported audio operation")
        import subprocess
        result = subprocess.run([audio.ffmpeg(), "-nostdin", "-y", "-i", str(source), "-af", filters[op], "-c:a", "pcm_f32le", str(dest)], capture_output=True, timeout=600)
        if result.returncode:
            raise ValueError("Audio processing failed")
        return audio.ingest(store, a["projectId"], dest, a["name"] + " · " + op, "processed")

    @app.post("/api/score/parse")
    def parse_score(data: dict):
        return score.parse_abc(data.get("abc", ""))

    @app.post("/api/score/write")
    def write_score(data: dict):
        return {"abc": score.write_abc(data.get("notes", []), data.get("chords", []), data.get("tempo", 120), data.get("timeSignature", (4, 4)), data.get("title", "Composition"))}

    @app.post("/api/midi/import")
    async def import_midi(file: UploadFile = File(...)):
        data = await file.read(10*1024*1024+1)
        if len(data) > 10*1024*1024:
            raise ValueError("MIDI file exceeds 10 MB")
        return score.read_midi(data)

    @app.post("/api/midi/export")
    def export_midi(data: dict):
        return Response(score.write_midi(data.get("notes", []), data.get("tempo", 120), data.get("timeSignature", (4, 4))), media_type="audio/midi", headers={"Content-Disposition": 'attachment; filename="composition.mid"'})

    @app.get("/api/jobs")
    def jobs(projectId: str | None = None):
        from .jobs import public_job
        return [public_job(j) for j in store.jobs(projectId)]

    @app.post("/api/jobs")
    def create_job(data: JobRequest, request: Request):
        from .agent_auth import submission_key
        from .jobs import public_job
        result=worker.enqueue(data, submission_key=submission_key(request), agent=getattr(request.state,'agent',None))
        return public_job(result)

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel(job_id: str):
        return worker.cancel(job_id)

    @app.post("/api/jobs/{job_id}/retry")
    def retry(job_id: str, request: Request, data: RetryRequest | None = None):
        from .agent_auth import submission_key
        from .jobs import public_job
        return public_job(worker.retry(job_id,data.approvedDownloads if data else [],submission_key=submission_key(request),agent=getattr(request.state,'agent',None)))

    @app.post("/api/jobs/{job_id}/priority")
    def priority(job_id: str, data: dict):
        return store.patch_job(job_id, priority=max(-10, min(10, int(data.get("priority", 0)))))

    @app.get("/api/projects/{project_id}/portable")
    def portable(project_id: str):
        from .maintenance import create_portable,project_busy
        if project_busy(store,{project_id}):raise ValueError('Finish or cancel this project’s jobs before downloading a backup')
        dest=store.root/'exports'/(uid()+'.zip')
        try:project=create_portable(store,project_id,dest)
        except BaseException:dest.unlink(missing_ok=True);raise
        return FileResponse(dest,filename=project.name+'.zip',media_type='application/zip')

    @app.get("/api/exports/{filename}")
    def download_export(filename: str, download_name: str | None = Query(None, max_length=200)):
        if Path(filename).name != filename:
            raise ValueError("Invalid filename")
        path = store.root / "exports" / filename
        if not path.is_file():
            raise KeyError("Export not found")
        name = filename
        if download_name:
            # The display name never changes which stored file is served.
            clean = re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]', '_', download_name).strip(' .')
            name = (Path(clean).stem[:180].strip(' .') or 'audio') + path.suffix
        return FileResponse(path, filename=name)

    @app.post("/api/projects/{project_id}/rendered")
    async def encode_browser_mix(project_id: str, file: UploadFile = File(...), options: str = Form("{}")):
        store.load(project_id)
        settings = json.loads(options)
        fmt = settings.get("format", "wav")
        if fmt not in ("wav", "flac", "mp3"):
            raise ValueError("Unsupported export format")
        source = store.project_dir(project_id) / "renders" / (uid() + "-mix.wav")
        total = 0
        with open(source, "wb") as f:
            while chunk := await file.read(1024*1024):
                total += len(chunk)
                if total > 1024**3:
                    raise ValueError("Rendered mix exceeds 1 GB")
                f.write(chunk)
        from .render import encode
        output = store.root / "exports" / (uid() + "." + fmt)
        await run_in_threadpool(encode, source, output, settings)
        if settings.get('saveToProject'):
            project=store.load(project_id)
            sources=settings.get('sourceAssetIds',[])
            if not isinstance(sources,list) or any(store.asset(i)['projectId']!=project_id for i in sources):raise ValueError('Mix sources must belong to this project')
            asset=await run_in_threadpool(audio.ingest,store,project_id,output,project.name+' · Studio mix','mix',{'sourceAssetIds':sources,'projectRevision':settings.get('projectRevision',project.revision),'master':bool(settings.get('master'))})
            return {'filename':output.name,'asset':asset}
        return {"filename": output.name}

    @app.websocket("/api/events")
    async def events(socket: WebSocket):
        origin = socket.headers.get('origin')
        if not authorized(socket.cookies.get("studio_session")) or not valid_origin(origin, socket.headers.get('host'), socket.url.scheme):
            await socket.close(code=1008)
            return
        await socket.accept()
        last = ""
        try:
            while True:
                if not authorized(socket.cookies.get('studio_session')):
                    await socket.close(code=1008, reason='Session expired. Sign in again.')
                    return
                from .jobs import public_job
                data = {"jobs": [public_job(j) for j in await run_in_threadpool(store.jobs)], "worker": worker.status}
                packed = json.dumps(data)
                if packed != last:
                    await socket.send_text(packed)
                    last = packed
                else:
                    await socket.send_json({"heartbeat": time.time()}) if int(time.time()) % 20 == 0 else None
                await asyncio.sleep(1)
        except (WebSocketDisconnect, RuntimeError):
            return

    from .maintenance import register as register_maintenance
    register_maintenance(app,store,worker)
    from .visual_api import register
    register(app,store)
    from .catalog import register as register_catalog
    register_catalog(app,store)
    from .library import register as register_library
    register_library(app,store)
    from .radio import register as register_radio
    register_radio(app,worker.radio)
    from .integrations import register as register_integrations
    register_integrations(app,store,worker,agents,bool(password))
    static = Path(__file__).resolve().parent.parent / "dist"
    if static.exists():
        app.mount("/", StaticFiles(directory=static, html=True), name="frontend")
    return app


app = create_app()
