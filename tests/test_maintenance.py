import json,zipfile,io,tomllib
from pathlib import Path
import pytest
from backend.storage import Store
from backend.schema import Project,JobRequest
from backend.jobs import Worker
from backend.maintenance import backup_job,restore_backup,remove_model,create_portable
from backend.portable import import_portable
from backend.model_runtime import MODELS,model_path

def test_verified_bundle_restores_projects_and_rejects_tampering_without_partial_restore(tmp_path):
    source=Store(tmp_path/'source');p=source.save(Project(name='Backup source'),create=True)
    job={'id':'backup-test','projectId':p.id,'kind':'backup','state':'Queued','createdAt':0,'request':{'options':{'projectIds':[p.id]}}}
    source.put_job(job);events=[];result=backup_job(source,job,lambda **event:events.append(event))
    assert events[-1]['unitsDone']==events[-1]['unitsTotal']==1
    archive=source.root/'exports'/result['filename'];assert result['verified']
    target=Store(tmp_path/'target');restored=restore_backup(target,archive)
    assert len(restored['projects'])==1 and restored['projects'][0]['id']!=p.id
    assert target.load(restored['projects'][0]['id']).name.startswith('Backup source')
    damaged=tmp_path/'damaged.zip'
    with zipfile.ZipFile(archive) as old,zipfile.ZipFile(damaged,'w') as new:
        for info in old.infolist():new.writestr(info.filename,b'broken' if info.filename.endswith('.zip') else old.read(info.filename))
    with pytest.raises(ValueError,match='checksum'):restore_backup(target,damaged)
    assert len(target.list_projects())==1


def test_portable_checksums_detect_modified_project_metadata(tmp_path):
    store=Store(tmp_path/'source');p=store.save(Project(),create=True);path=tmp_path/'original.zip';create_portable(store,p.id,path)
    bad=io.BytesIO()
    with zipfile.ZipFile(path) as src,zipfile.ZipFile(bad,'w') as dest:
        for info in src.infolist():dest.writestr(info.filename,b'{}' if info.filename=='project.json' else src.read(info.filename))
    bad.seek(0);target=Store(tmp_path/'target')
    with pytest.raises(ValueError,match='checksum'):import_portable(target,bad)
    assert target.list_projects()==[]


def test_models_cannot_be_removed_when_core_or_needed_by_work(tmp_path,monkeypatch):
    store=Store(tmp_path);worker=Worker(store)
    with pytest.raises(ValueError,match='Required'):remove_model(store,worker,'yue2')
    key='demucs';path=model_path(store.root,key);path.parent.mkdir(parents=True);path.write_bytes(b'fixture')
    p=store.save(Project(),create=True);store.put_job({'id':'work','projectId':p.id,'state':'Queued','createdAt':0,'kind':'separate'})
    with pytest.raises(ValueError,match='jobs'):remove_model(store,worker,key)
    assert path.exists();store.patch_job('work',state='Complete')
    remove_model(store,worker,key);assert not path.exists()


def test_release_version_and_build_inputs_are_consistent():
    from backend.version import VERSION
    root=Path(__file__).resolve().parents[1]
    assert json.loads((root/'package.json').read_text())['version']==VERSION
    assert tomllib.loads((root/'pyproject.toml').read_text())['project']['version']==VERSION
    assert 'image.version="'+VERSION+'"' in (root/'Dockerfile').read_text()
    assert json.loads((root/'backend/core_model_manifest.json').read_text())=={k:v for k,v in MODELS.items() if v['core']}
    assert json.loads((root/'backend/tool_model_manifest.json').read_text())=={k:MODELS[k] for k in ['realaudio-v4','demucs','sortformer','instrumental-v1']}
    assert (root/'scripts/runtime-requirements.txt').read_text().splitlines()==tomllib.loads((root/'pyproject.toml').read_text())['project']['dependencies']

def test_interrupted_backup_cleanup_only_removes_owned_temporary_files(tmp_path):
    from backend.maintenance import cleanup_backup_work
    store=Store(tmp_path)
    for name in ['backup-abc.partial','backup-abc-0.zip','keep.zip','backup-other.partial']:(store.root/'temp'/name).write_bytes(b'part')
    cleanup_backup_work(store,'abc')
    assert sorted(p.name for p in (store.root/'temp').iterdir())==['backup-other.partial','keep.zip']
    cleanup_backup_work(store)
    assert [p.name for p in (store.root/'temp').iterdir()]==['keep.zip']
