"""Observe the pinned Hub 0.36 download callbacks, including named Xet files.

Only display events are added. The Hub still owns downloads, retries and integrity checks.
"""
import contextlib,functools,inspect,threading,time
from pathlib import Path

def install_download_progress(emit):
    import huggingface_hub
    if not huggingface_hub.__version__.startswith('0.36.'):return False
    from huggingface_hub import file_download as hub
    if getattr(hub,'_studio_progress_installed',False):return True
    original_download=hub._download_to_tmp_and_move
    original_bar=hub._get_progress_bar_context
    signature=inspect.signature(original_download)
    local=threading.local();lock=threading.RLock();files={};last=[0.]

    def publish(record,force=False):
        with lock:
            now=time.monotonic()
            if not force and now-last[0]<.4:return
            last[0]=now
            total=record.get('total');done=record['completed']
            emit(state='Downloading models',message=record['model']+' · '+record['name'],progress=done/total if total else None,progressLabel='Current model file',unitsDone=done,unitsTotal=total,unit='bytes',download=list(files.values())[-100:])

    @functools.wraps(original_download)
    def download(*args,**kwargs):
        values=signature.bind(*args,**kwargs).arguments
        destination=Path(values['destination_path'])
        if destination.exists() and not values.get('force_download'):return original_download(*args,**kwargs)
        model=next((part.removeprefix('models--').replace('--','/') for part in destination.parts if part.startswith('models--')),'Model')
        name=values['filename'];key=model+'/'+name
        record={'name':name,'model':model,'completed':0,'total':values.get('expected_size'),'state':'Downloading'}
        with lock:files[key]=record
        previous=getattr(local,'record',None);local.record=record;publish(record,True)
        try:
            result=original_download(*args,**kwargs)
            with lock:record.update(completed=destination.stat().st_size,state='Ready')
            publish(record,True);return result
        except Exception:
            with lock:record['state']='Interrupted'
            publish(record,True);raise
        finally:local.record=previous

    @contextlib.contextmanager
    def progress_bar(*args,**kwargs):
        record=getattr(local,'record',None)
        with original_bar(*args,**kwargs) as bar:
            if record is None:yield bar;return
            with lock:record['completed']=kwargs.get('initial',0)
            class Observed:
                def __getattr__(self,name):return getattr(bar,name)
                def update(self,n=1):
                    result=bar.update(n)
                    with lock:record['completed']+=n
                    publish(record);return result
            yield Observed()
    hub._download_to_tmp_and_move=download
    hub._get_progress_bar_context=progress_bar
    hub._studio_progress_installed=True
    return True
