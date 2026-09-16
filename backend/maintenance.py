"""Project backups and optional-model maintenance over the existing store."""
import hashlib, json, shutil, time, zipfile
from pathlib import Path
from filelock import FileLock, Timeout
from fastapi import UploadFile, File
from starlette.concurrency import run_in_threadpool
from .schema import Project, uid
from .portable import FOLDERS, safe_relative, import_portable
from .model_runtime import MODELS, model_path, bundled_path


def project_busy(store, project_ids, except_job=None):
    with store.connect() as db:
        return any(row['id']!=except_job and row['project_id'] in project_ids for row in db.execute("SELECT id,project_id FROM jobs WHERE state NOT IN ('Complete','Failed','Cancelled')"))


def create_portable(store, project_id, destination, check=lambda:None):
    with store.connect() as db:
        db.execute('BEGIN')
        row=db.execute('SELECT data FROM projects WHERE id=?',(project_id,)).fetchone()
        if not row:raise KeyError('Project not found')
        project=Project.model_validate_json(row[0])
        assets=[json.loads(row[0]) for row in db.execute('SELECT data FROM assets WHERE project_id=?',(project_id,))]
    base=store.project_dir(project_id).resolve();checksums={}
    with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=1) as archive:
        for name,data in [('project.json',project.model_dump_json().encode()),('assets.json',json.dumps(assets).encode())]:
            archive.writestr(name,data);checksums[name]=hashlib.sha256(data).hexdigest()
        for folder in sorted(FOLDERS):
            for path in sorted((base/folder).rglob('*')):
                check()
                if not path.is_file() or path.is_symlink() or path.suffix in ('.tmp','.partial','.lock'):continue
                if not path.resolve().is_relative_to(base):raise ValueError('Backup source escapes project storage')
                name=path.relative_to(base).as_posix();digest=hashlib.sha256()
                with path.open('rb') as source,archive.open(name,'w',force_zip64=True) as target:
                    while block:=source.read(1024*1024):check();digest.update(block);target.write(block)
                checksums[name]=digest.hexdigest()
        required=[a['path'] for a in assets]+[a.path for a in project.visuals.assets]
        if any(name not in checksums for name in required):raise ValueError('A referenced media file is missing; backup was not completed')
        archive.writestr('checksums.json',json.dumps(checksums,sort_keys=True))
    return project


def backup_job(store,job,emit):
    project_ids=job['request']['options']['projectIds'];output=store.root/'temp'/('backup-'+job['id']+'.partial');parts=[]
    def check():
        if store.job(job['id'])['state']=='Cancelled':raise InterruptedError('Backup cancelled')
    try:
        if project_busy(store,set(project_ids),job['id']):raise ValueError('Finish or cancel jobs in these projects before making a backup')
        with zipfile.ZipFile(output,'w',zipfile.ZIP_STORED) as bundle:
            records=[]
            for index,project_id in enumerate(project_ids):
                check();part=store.root/'temp'/('backup-'+job['id']+'-'+str(index)+'.zip');parts.append(part)
                emit(state='Preparing assets',message='Backing up project '+str(index+1),unitsDone=index,unitsTotal=len(project_ids),unit='projects')
                project=create_portable(store,project_id,part,check)
                with part.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
                name=project_id+'.zip';bundle.write(part,name);records.append({'file':name,'projectId':project_id,'name':project.name,'sha256':digest})
            bundle.writestr('backup.json',json.dumps({'version':1,'createdAt':time.time(),'projects':records}))
        emit(state='Finalizing',message='Verifying backup archive',progress=None,unitsDone=len(project_ids),unitsTotal=len(project_ids),unit='projects')
        with zipfile.ZipFile(output) as z:
            if z.testzip():raise ValueError('Backup archive verification failed')
        check()
        with output.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
        final=store.root/'exports'/(uid()+'-backup.zip')
        output.replace(final);output=final
        result={'filename':output.name,'createdAt':time.time(),'projects':records,'bytes':output.stat().st_size,'sha256':digest,'verified':True}
        with store.connect() as db:db.execute("INSERT OR REPLACE INTO metadata VALUES('last_backup',?)",(json.dumps(result),))
        store.patch_job(job['id'],output=output.name)
        return result
    except BaseException:
        output.unlink(missing_ok=True);raise
    finally:
        for part in parts:part.unlink(missing_ok=True)


def cleanup_backup_work(store,job_id=None):
    # Worker lease is held on startup; per-job cleanup runs only after its child exits.
    if job_id is not None and not job_id.replace('-', '').isalnum():raise ValueError('Invalid backup job id')
    pattern='backup-'+job_id+'-*' if job_id else 'backup-*'
    candidates=list((store.root/'temp').glob(pattern))
    if job_id:candidates.append(store.root/'temp'/('backup-'+job_id+'.partial'))
    for path in candidates:
        if path.is_file() and not path.is_symlink() and path.suffix in ('.partial','.zip'):
            path.unlink(missing_ok=True)


def restore_backup(store,source):
    import tempfile
    from .storage import Store
    with tempfile.TemporaryDirectory(dir=store.root/'temp',prefix='backup-restore-') as temp:
        stage=Path(temp);prepared=Store(stage/'prepared');projects=[]
        with zipfile.ZipFile(source) as bundle:
            infos=bundle.infolist()
            if len(infos)>1001 or sum(i.file_size for i in infos)>8*1024**3:raise ValueError('Backup exceeds 1,000 projects or 8 GiB')
            if len({i.filename for i in infos})!=len(infos):raise ValueError('Duplicate backup entries')
            if bundle.getinfo('backup.json').file_size>2*1024**2:raise ValueError('Backup manifest is too large')
            manifest=json.loads(bundle.read('backup.json'))
            if manifest.get('version')!=1 or not isinstance(manifest.get('projects'),list) or not manifest['projects']:raise ValueError('Invalid backup manifest')
            for record in manifest['projects']:
                name=str(safe_relative(record['file']))
                if '/' in name or not name.endswith('.zip'):raise ValueError('Invalid project archive name')
                part=stage/name
                with bundle.open(name) as src,part.open('wb') as dst:shutil.copyfileobj(src,dst,1024*1024)
                with part.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
                if digest!=record.get('sha256'):raise ValueError('Backup checksum mismatch')
                projects.append(import_portable(prepared,part))
        # Every project is validated before making any visible change to the live store.
        copied=[];committed=False
        try:
            for p in projects:
                target=store.root/'projects'/p.id
                if target.exists():raise ValueError('Restore destination already exists')
                copied.append(target);shutil.copytree(prepared.project_dir(p.id),target)
            with store.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                for p in projects:
                    data=p.model_dump_json();db.execute('INSERT INTO projects VALUES(?,?,?,?)',(p.id,p.revision,p.updatedAt,data))
                    db.execute('INSERT INTO revisions VALUES(?,?,?,?,?)',(p.id,p.revision,'Restored verified backup',time.time(),data))
                    for a in prepared.assets(p.id):db.execute('INSERT INTO assets VALUES(?,?,?)',(a['id'],p.id,json.dumps(a)))
            committed=True
        finally:
            if not committed:
                for path in copied:
                    if path.resolve().parent==(store.root/'projects').resolve():shutil.rmtree(path,ignore_errors=True)
        return {'projects':[{'id':p.id,'name':p.name} for p in projects]}


def remove_model(store,worker,key):
    spec=MODELS.get(key)
    if not spec:raise ValueError('Unknown model')
    if spec['core']:raise ValueError('Required music models cannot be removed')
    if bundled_path(key) is not None:raise ValueError('Included image models cannot be removed')
    with FileLock(str(store.root/'maintenance.lock'),timeout=0), FileLock(str(store.root/'models'/'optional-download.lock'),timeout=0):
        with store.connect() as db:
            if db.execute("SELECT 1 FROM jobs WHERE state NOT IN ('Complete','Failed','Cancelled') LIMIT 1").fetchone():raise ValueError('Finish or cancel queued jobs before removing models')
        if worker.radio.current():raise ValueError('Stop Radio before removing models')
        path=model_path(store.root,key)
        target=path if key=='demucs' else path.parents[1]
        if target.is_symlink() or not target.resolve().is_relative_to(store.root):raise ValueError('Unsafe model cache path')
        if target.is_file():target.unlink()
        elif target.exists():shutil.rmtree(target)
    return {'removed':key}


def register(app,store,worker):
    @app.get('/api/backups')
    def backups():
        with store.connect() as db:row=db.execute("SELECT value FROM metadata WHERE key='last_backup'").fetchone()
        return {'last':json.loads(row[0]) if row else None}

    @app.post('/api/backups/import')
    async def restore(file:UploadFile=File(...)):
        target=store.root/'temp'/(uid()+'.zip');total=0
        try:
            with target.open('wb') as f:
                while block:=await file.read(1024*1024):
                    total+=len(block)
                    if total>8*1024**3:raise ValueError('Backup upload exceeds 8 GiB')
                    f.write(block)
            return await run_in_threadpool(restore_backup,store,target)
        finally:target.unlink(missing_ok=True)

    @app.delete('/api/models/{model_id}')
    def remove(model_id:str):
        try:return remove_model(store,worker,model_id)
        except Timeout:raise ValueError('A model download is active; try again after it finishes')
