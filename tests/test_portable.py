import io,json,zipfile
import numpy as np
import soundfile as sf
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.storage import Store
from backend.jobs import Worker
from backend.schema import Project
from backend.portable import import_portable

def test_portable_audio_roundtrip(tmp_path):
    with TestClient(create_app(tmp_path/'app',start_worker=False)) as client:
        p=client.post('/api/projects',json={'name':'Archive fixture'}).json()
        buf=io.BytesIO();sf.write(buf,np.zeros((4800,2)),48000,format='WAV')
        a=client.post('/api/projects/'+p['id']+'/import',files={'file':('source.wav',buf.getvalue(),'audio/wav')}).json()
        p['tracks'][0]['clips'][0]['assetId']=a['id']
        assert client.put('/api/projects/'+p['id'],json=p).status_code==200
        archive=client.get('/api/projects/'+p['id']+'/portable')
        restored=client.post('/api/projects/import-portable',files={'file':('project.zip',archive.content,'application/zip')})
        assert restored.status_code==200,restored.text
        q=restored.json();assert q['id']!=p['id']
        new_id=q['tracks'][0]['clips'][0]['assetId'];assert new_id!=a['id']
        assert client.get('/api/assets/'+new_id+'/audio').content==client.get('/api/assets/'+a['id']+'/audio').content
        assert client.get('/api/assets/'+new_id+'/peaks').status_code==200

@pytest.mark.parametrize('path',['../outside','/absolute','audio/../../outside','C:/outside','audio\\..\\outside'])
def test_archive_cannot_escape_storage(tmp_path,path):
    store=Store(tmp_path/'storage');buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w') as z:z.writestr(path,b'bad')
    buf.seek(0)
    with pytest.raises(ValueError):import_portable(store,buf)
    assert store.list_projects()==[]

def test_second_worker_cannot_interrupt_active_queue(tmp_path):
    store=Store(tmp_path/'storage');first=Worker(store);second=Worker(store)
    first.start()
    try:
        with pytest.raises(RuntimeError,match='Another worker'):second.start()
    finally:first.stop()
    second.start();second.stop()
