import os
from collections import namedtuple
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend import storage_usage as usage
from backend import model_runtime as models
from backend.schema import Project, JobRequest


@pytest.fixture(autouse=True)
def isolated_storage(monkeypatch):
    for key in ('RUNPOD_POD_ID','DAW_STORAGE_CAPACITY_GB','DAW_STORAGE_VOLUME_ROOT'):
        monkeypatch.delenv(key,raising=False)
    usage._cache.clear()
    disk=namedtuple('Disk','total used free')(100_000_000_000_000,1_000_000_000_000,99_000_000_000_000)
    monkeypatch.setattr(usage.shutil,'disk_usage',lambda root:disk)


def test_measures_real_files_once_and_does_not_follow_cache_symlinks(tmp_path):
    (tmp_path/'blob').write_bytes(b'abcde')
    os.link(tmp_path/'blob',tmp_path/'hardlink')
    assert usage.measure_files(tmp_path)==(5,True)
    try:os.symlink(tmp_path/'blob',tmp_path/'snapshot')
    except OSError:pytest.skip('Symlink creation needs host privileges')
    assert usage.measure_files(tmp_path)==(5,True)


def test_pod_allowance_is_not_the_shared_host_filesystem(tmp_path,monkeypatch):
    root=tmp_path/'app';root.mkdir()
    (root/'project').write_bytes(b'1234')
    (tmp_path/'other-workspace-file').write_bytes(b'12')
    monkeypatch.setenv('RUNPOD_POD_ID','test')
    monkeypatch.setenv('DAW_STORAGE_VOLUME_ROOT',str(tmp_path))
    monkeypatch.setenv('DAW_STORAGE_CAPACITY_GB','80')
    result=usage.storage_usage(root)
    assert result['usedBytes']==6 and result['capacityBytes']==80_000_000_000
    assert result['availableBytes']==79_999_999_994 and result['source']=='configured'
    (root/'project').write_bytes(b'12345678')
    assert usage.storage_usage(root,refresh=True)['usedBytes']==10


def test_unknown_pod_quota_never_reports_host_free_space(tmp_path,monkeypatch):
    monkeypatch.setenv('RUNPOD_POD_ID','test')
    (tmp_path/'project').write_bytes(b'123')
    result=usage.storage_usage(tmp_path)
    assert result['usedBytes']==3 and result['source']=='unknown'
    assert result['availableBytes'] is None and result['capacityBytes'] is None
    with TestClient(create_app(tmp_path,start_worker=False)) as client:
        assert client.get('/api/status').json()['storageFreeGb'] is None
        assert client.get('/api/models').json()['freeBytes'] is None


def test_local_disk_and_incomplete_volume_have_honest_available_values(tmp_path,monkeypatch):
    assert usage.storage_usage(tmp_path)['availableBytes']==99_000_000_000_000
    monkeypatch.setenv('DAW_STORAGE_CAPACITY_GB','80')
    monkeypatch.setattr(usage,'measure_files',lambda root:(100,False))
    result=usage.storage_usage(tmp_path)
    assert result['usedBytes']==100 and not result['complete'] and result['availableBytes'] is None


def test_download_checks_volume_allowance_even_when_host_has_terabytes_free(tmp_path,monkeypatch):
    monkeypatch.setenv('DAW_STORAGE_CAPACITY_GB','0.00000001')  # Ten-byte allowance.
    monkeypatch.setitem(models.MODELS,'qwen-1.7B',{**models.MODELS['qwen-1.7B'],'files':[{'path':'weights','bytes':9}],'bytes':9})
    (tmp_path/'existing-project').write_bytes(b'ab')
    request=JobRequest(projectId='project',kind='lyrics',options={'model':'Qwen/Qwen3-1.7B'})
    with pytest.raises(models.ModelDownloadRequired) as error:models.check_downloads(tmp_path,Project(),request)
    assert error.value.detail['freeBytes']==8
    request.approvedDownloads=['qwen-1.7B']
    with pytest.raises(ValueError,match='Not enough persistent storage'):models.check_downloads(tmp_path,Project(),request)
