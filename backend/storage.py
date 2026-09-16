"""Transactional authority with inspectable snapshots and immutable media."""
from __future__ import annotations
import json
import os
import re
import sqlite3
import time
from pathlib import Path
from contextlib import contextmanager
from .schema import Project, uid


class Conflict(Exception):
    pass


class Store:
    def __init__(self, root: Path):
        self.root = root.resolve()
        for name in ("projects", "models", "cache", "library", "exports", "logs", "temp", "presets"):
            (self.root / name).mkdir(parents=True, exist_ok=True)
        self.db = self.root / "studio.sqlite3"
        with self.connect() as db:
            db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, revision INTEGER, updated REAL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS revisions(project_id TEXT, revision INTEGER, label TEXT, created REAL, data TEXT, PRIMARY KEY(project_id,revision));
            CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, project_id TEXT, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, project_id TEXT, state TEXT, created REAL, updated REAL, priority INTEGER DEFAULT 0, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS job_queue ON jobs(state,priority,created);
            CREATE INDEX IF NOT EXISTS asset_project ON assets(project_id);
            CREATE TABLE IF NOT EXISTS submissions(key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, job_id TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS radio_presets(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated REAL NOT NULL, data TEXT NOT NULL);
            """)

    def workstation_id(self):
        with self.connect() as db:
            db.execute("INSERT OR IGNORE INTO metadata VALUES('workstation_id',?)", (uid(),))
            return db.execute("SELECT value FROM metadata WHERE key='workstation_id'").fetchone()[0]

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def project_dir(self, project_id: str) -> Path:
        if not re.fullmatch(r"[a-f0-9]{32}", project_id):
            raise ValueError("Invalid project id")
        path = self.root / "projects" / project_id
        for sub in ("audio", "stems", "renders", "waveforms", "spectrograms", "generation", "scores", "exports", "autosaves", "visuals"):
            (path / sub).mkdir(parents=True, exist_ok=True)
        return path

    def load(self, project_id: str) -> Project:
        with self.connect() as db:
            row = db.execute("SELECT data FROM projects WHERE id=?", (project_id,)).fetchone()
        if row is None:
            raise KeyError("Project not found")
        return Project.model_validate_json(row["data"])

    def save(self, project: Project, label="Edit", create=False) -> Project:
        project = project.model_copy(deep=True)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT revision FROM projects WHERE id=?", (project.id,)).fetchone()
            if (row is None and not create) or (row is not None and (create or row["revision"] != project.revision)):
                raise Conflict("Project changed in another session. Reload or save a new copy.")
            project.revision += 1
            project.updatedAt = time.time()
            data = project.model_dump_json()
            db.execute("INSERT OR REPLACE INTO projects VALUES(?,?,?,?)", (project.id, project.revision, project.updatedAt, data))
            db.execute("INSERT INTO revisions VALUES(?,?,?,?,?)", (project.id, project.revision, label[:180], project.updatedAt, data))
            # Bound routine autosaves; named revisions remain available.
            db.execute("DELETE FROM revisions WHERE project_id=? AND label='Autosave' AND revision < ?", (project.id, project.revision - 200))
        self.snapshot(project)
        return project

    def snapshot(self, project):
        # A stale snapshot never wins a later committed revision.
        from filelock import FileLock
        path = self.project_dir(project.id) / "project.json"
        with FileLock(str(path) + ".lock"):
            latest = self.load(project.id)
            temp = path.with_suffix(".tmp")
            with open(temp, "w", encoding="utf-8") as f:
                f.write(latest.model_dump_json(indent=2))
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp, path)

    def mutate(self, project_id, fn, label):
        for _ in range(10):
            p = self.load(project_id)
            fn(p)
            try:
                return self.save(Project.model_validate(p.model_dump()), label)
            except Conflict:
                continue
        raise Conflict("Project is busy; retry the operation")

    def list_projects(self):
        with self.connect() as db:
            rows = db.execute("SELECT data FROM projects ORDER BY updated DESC").fetchall()
        return [{k: d[k] for k in ("id", "name", "tempo", "updatedAt", "revision", "favorite", "archived", "tags")} | {"trackCount": len(d["tracks"]),'coverId':d.get('visuals',{}).get('coverId'),'candidateCount':len(d.get('candidates',[]))} for row in rows for d in [json.loads(row["data"])]]

    def add_asset(self, project_id, data):
        data = {**data, "id": data.get("id", uid()), "projectId": project_id}
        with self.connect() as db:
            db.execute("INSERT INTO assets VALUES(?,?,?)", (data["id"], project_id, json.dumps(data)))
        return data

    def asset(self, asset_id):
        with self.connect() as db:
            row = db.execute("SELECT data FROM assets WHERE id=?", (asset_id,)).fetchone()
        if row is None:
            raise KeyError("Audio asset not found")
        return json.loads(row["data"])

    def assets(self, project_id):
        with self.connect() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT data FROM assets WHERE project_id=?", (project_id,))]

    def asset_path(self, asset_id):
        data = self.asset(asset_id)
        path = (self.project_dir(data["projectId"]) / data["path"]).resolve()
        if not path.is_relative_to(self.project_dir(data["projectId"]).resolve()) or not path.is_file():
            raise KeyError("Audio file missing")
        return path

    def jobs(self, project_id=None):
        with self.connect() as db:
            sql = "SELECT data FROM jobs" + (" WHERE project_id=?" if project_id else "") + " ORDER BY created DESC LIMIT 200"
            return [json.loads(r[0]) for r in db.execute(sql, (project_id,) if project_id else ())]

    def job(self, job_id):
        with self.connect() as db:
            row = db.execute("SELECT data FROM jobs WHERE id=?", (job_id,)).fetchone()
        if row is None:
            raise KeyError("Job not found")
        return json.loads(row[0])

    def submitted_job(self, key, fingerprint, db=None):
        if not key: return None
        if db is None:
            with self.connect() as connection:
                return self.submitted_job(key, fingerprint, connection)
        row = db.execute("SELECT fingerprint,job_id FROM submissions WHERE key=?", (key,)).fetchone()
        if row is None: return None
        if row['fingerprint'] != fingerprint:
            raise Conflict('This submission key was already used for different settings. Start a new submission.')
        job = db.execute("SELECT data FROM jobs WHERE id=?", (row['job_id'],)).fetchone()
        if job is None: raise Conflict('The original submission is no longer available.')
        return json.loads(job[0])

    def record_submission(self, db, key, fingerprint, job_id):
        if key: db.execute("INSERT INTO submissions VALUES(?,?,?)", (key, fingerprint, job_id))

    def requeue_job(self, job_id, request, key=None, fingerprint=None):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            previous = self.submitted_job(key, fingerprint, db)
            if previous: return previous
            row = db.execute('SELECT data FROM jobs WHERE id=?', (job_id,)).fetchone()
            if not row: raise KeyError('Job not found')
            old = json.loads(row[0])
            if old['state'] != 'Failed': raise Conflict('This job is already being retried. Refresh the queue.')
            now = time.time()
            data = {**old, 'request':request, 'state':'Queued', 'message':'Retry queued', 'updatedAt':now,
                    'finishedAt':None, 'startedAt':None, 'stageStartedAt':now, 'progress':None,
                    'unitsDone':None, 'unitsTotal':None, 'progressLabel':''}
            db.execute('UPDATE jobs SET state=?,updated=?,data=? WHERE id=?', ('Queued',now,json.dumps(data),job_id))
            self.record_submission(db,key,fingerprint,job_id)
            return data

    def put_job(self, data, key=None, fingerprint=None):
        data = {**data, "updatedAt": time.time()}
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            previous = self.submitted_job(key, fingerprint, db)
            if previous: return previous
            self.record_submission(db,key,fingerprint,data['id'])
            db.execute("INSERT OR REPLACE INTO jobs VALUES(?,?,?,?,?,?,?)", (data["id"], data["projectId"], data["state"], data["createdAt"], data["updatedAt"], data.get("priority", 0), json.dumps(data)))
        return data

    def patch_job(self, job_id, **changes):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT data FROM jobs WHERE id=?", (job_id,)).fetchone()
            if row is None:
                raise KeyError("Job not found")
            old=json.loads(row[0]);now=time.time()
            if changes.get('state',old['state'])!=old['state']:
                changes.setdefault('stageStartedAt',now)
                changes.setdefault('progress',None)
                changes.setdefault('unitsDone',None)
                changes.setdefault('unitsTotal',None)
                changes.setdefault('progressLabel','')
            if changes.get('state') in ('Complete','Failed','Cancelled'):
                changes.setdefault('finishedAt',now)
                if changes['state']=='Complete':changes['progress']=1
            data = {**old, **changes, "updatedAt": now}
            # A cancellation remains authoritative even if a late worker event arrives.
            if old["state"] == "Cancelled":
                data["state"] = "Cancelled"
                data['finishedAt']=old.get('finishedAt',now)
            db.execute("UPDATE jobs SET state=?,updated=?,priority=?,data=? WHERE id=?", (data["state"], data["updatedAt"], data.get("priority", 0), json.dumps(data), job_id))
        return data

    def claim_job(self, kinds=None):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            predicate = '' if kinds is None else ' AND json_extract(data,\'$.kind\') IN ('+','.join('?' for _ in kinds)+')'
            row = db.execute("SELECT data FROM jobs WHERE state='Queued'"+predicate+" ORDER BY priority DESC,created LIMIT 1", tuple(kinds or ())).fetchone()
            if row is None:
                return None
            now=time.time()
            data = {**json.loads(row[0]), "state": "Preparing", "updatedAt": now,'startedAt':now,'stageStartedAt':now,'finishedAt':None,'progress':None}
            db.execute("UPDATE jobs SET state=?,updated=?,data=? WHERE id=?", (data["state"], data["updatedAt"], json.dumps(data), data["id"]))
            return data
