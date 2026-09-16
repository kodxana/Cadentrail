import json,sys
from pathlib import Path
from .storage import Store
from .schema import JobRequest
from .maintenance import backup_job
from .model_runtime import prepare_models

def emit(**event):print(json.dumps(event),flush=True)
def main():
    task=json.loads(sys.stdin.readline());store=Store(Path(task['root']));job=task['job']
    if job['kind']=='backup':result=backup_job(store,job,emit)
    else:
        prepare_models(store.root,store.load(job['projectId']),JobRequest.model_validate(job['request']),emit)
        result={'modelId':job['request']['options']['modelId']}
    emit(done=True,result=result,state='Finalizing',message='Backup verified' if job['kind']=='backup' else 'Model downloaded')
if __name__=='__main__':
    try:main()
    except Exception as e:emit(error=str(e));raise
