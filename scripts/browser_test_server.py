"""Isolated CPU-only acceptance server. Never uses production storage."""
from pathlib import Path
import os, tempfile
import uvicorn


def main():
    base=Path(__file__).resolve().parents[1]
    runtime=base/'.runtime';runtime.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='browser-acceptance-',dir=runtime) as directory:
        os.environ['DAW_STORAGE']=directory
        os.environ['DAW_PASSWORD']='cadentrail-browser-test'
        os.environ.pop('RUNPOD_POD_ID',None)
        from backend import model_runtime as models
        inventory = models.inventory
        def test_inventory(root, key):
            result = inventory(root, key)
            if key in ('yue2', 'yue2-vae', 'instrumental-v1'): result.update(ready=True, missingBytes=0)
            return result
        models.inventory = test_inventory
        from backend.app import create_app
        from fastapi import Request
        from fastapi.staticfiles import StaticFiles
        app=create_app(Path(directory))
        app.router.routes=[route for route in app.router.routes if getattr(route,'name','')!='frontend']
        @app.post('/api/_test/reset-signin')
        def reset_signin():
            # Independent browser cases share one local test server, not one
            # user's sign-in rate window. Production limits stay unchanged.
            with app.state.sessions.lock:app.state.sessions.attempts.clear()
            return {'reset':True}
        @app.post('/api/_test/expire')
        def expire(request:Request):
            app.state.sessions.revoke(request.cookies.get('studio_session'))
            return {'expired':True}
        @app.post('/api/_test/takes')
        def take_fixture():
            # Isolated audio/metadata fixtures for revision and truncation UI checks.
            import numpy as np, soundfile as sf
            from backend.schema import Project, Candidate, Generation
            from backend.audio import ingest
            from uuid import uuid4
            store=app.state.store
            project=store.save(Project(name='Generation boundaries'),create=True)
            project.generation=Generation(style='Warm acoustic duet',lyrics='[Verse]\nA new morning',role='duet')
            for index,flags in enumerate([{'abc':False,'semantic':False},{'abc':False,'semantic':True},{'abc':True,'semantic':False},None]):
                path=store.project_dir(project.id)/f'take-{index}.wav'
                sf.write(path,np.sin(np.arange(8000*8)*2*np.pi*220/8000)*.04,8000)
                asset=ingest(store,project.id,path,path.name,origin='yue2')
                source=project.generation.model_copy(update={'odeSteps':48})
                metadata={'generation':source.model_dump()}
                if flags is not None:metadata['truncated']=flags
                project.candidates.append(Candidate(id=uuid4().hex,name=['Complete take','Limited ending','Limited plan','Older take'][index],assetId=asset['id'],jobId='fixture',seed=10+index,metadata=metadata))
            return store.save(project).model_dump()
        @app.post('/api/_test/radio')
        def radio_fixture():
            # Test-only real audio: bounded two-deck playback, no model inference.
            import time, numpy as np, soundfile as sf
            from backend.radio import StationRequest
            radio=app.state.worker.radio
            with radio.lock:
                if radio.session:radio.stop(radio.session['id'])
                station=radio.create(StationRequest(description='Dreamy Japanese J-pop',language='ja'),verify=False)
                s=radio.session;s['active']=True
                for number in (1,2):
                    tid=str(number)*32;folder=radio.root/s['id']/tid;folder.mkdir()
                    rate=8000;duration=90
                    sf.write(folder/'audio.flac',np.sin(np.arange(rate*duration)*2*np.pi*(220+number*55)/rate)*.04,rate)
                    s['tracks'].append(dict(id=tid,title='Radio browser check '+str(number),style='Soft electronic instrumental fixture',duration=duration,number=number,startedAt=time.time()-12 if number==1 else None,url=f"/api/radio/{s['id']}/audio/{tid}",directionRevision=1,language='ja',truncated=False))
                s.update(count=2,state='Ready',message='Next song is ready',progress=1,listening=True)
                return radio.snapshot(s['id'])
        @app.post('/api/_test/radio/clock')
        def radio_clock():
            import time,numpy as np,soundfile as sf
            radio=app.state.worker.radio
            with radio.lock:
                s=radio.session
                for t in s['tracks']:radio.remove(radio.root/s['id']/t['id'])
                s['tracks']=[]
                for number in (3,4):
                    tid=str(number)*32;folder=radio.root/s['id']/tid;folder.mkdir()
                    sf.write(folder/'audio.flac',np.sin(np.arange(8000*90)*2*np.pi*330/8000)*.04,8000)
                    s['tracks'].append(dict(id=tid,title='Radio browser check '+str(number),style='Reconnect fixture',duration=90,number=number,startedAt=time.time()-7 if number==3 else None,url=f"/api/radio/{s['id']}/audio/{tid}",directionRevision=s['revision'],language='ja',truncated=False))
                s['count']=4
                return radio.snapshot(s['id'])
        static=Path(os.environ.get('DAW_TEST_DIST',str(base/'dist')))
        app.mount('/',StaticFiles(directory=static,html=True),name='frontend')
        uvicorn.run(app,host='127.0.0.1',port=int(os.environ.get('DAW_TEST_PORT','8014')),log_level='warning')


if __name__=='__main__':main()
