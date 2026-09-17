"""Durable, serial GPU queue. Hard cancellation also interrupts model downloads."""
from __future__ import annotations
import importlib.util
import json
import os
import subprocess
import sys
import threading
import time
import traceback
from filelock import FileLock, Timeout
from .schema import Candidate, JobRequest, uid
from .audio import ingest

TERMINAL = {"Complete", "Failed", "Cancelled"}

def public_job(job):
    # Large arrangement snapshots belong to worker storage, not each progress broadcast.
    return {k:v for k,v in job.items() if k not in ('snapshot','timingBefore')}


def submission_guard(method):
    from functools import wraps
    @wraps(method)
    def guarded(self,*args,**kwargs):
        with self.submission_lock:
            return method(self,*args,**kwargs)
    return guarded

class Worker:
    def __init__(self, store):
        self.store = store
        self.stopping = threading.Event()
        self.wake = threading.Event()
        self.process = None
        self.current = None
        self.log = None
        self.thread = None
        self.cpu_thread = None
        self.cpu_process = None
        self.cpu_current = None
        self.auto_thread = None
        from .radio import Radio
        self.radio = Radio(self)
        self.lease = FileLock(str(store.root / 'worker.lock'))
        self.submission_lock = FileLock(str(store.root / 'maintenance.lock'), timeout=30)
        self.status = {"stage": "Ready", "model": "Not loaded", "available": importlib.util.find_spec("yue2") is not None}

    def start(self):
        try:
            self.lease.acquire(timeout=0)
        except Timeout as e:
            raise RuntimeError('Another worker owns this storage directory. Run one application worker per DAW_STORAGE.') from e
        for job in self.store.jobs():
            if job["state"] not in TERMINAL | {"Queued"}:
                self.store.patch_job(job["id"], state="Failed", message="Worker was interrupted by restart. Completed candidates are preserved; retry to continue.")
        from .maintenance import cleanup_backup_work
        cleanup_backup_work(self.store)
        self.radio.start()
        self.thread = threading.Thread(target=self.run, name="generation-queue", daemon=True)
        self.thread.start()
        self.cpu_thread = threading.Thread(target=self.run_cpu, name='media-queue', daemon=True)
        self.cpu_thread.start()
        self.auto_thread=threading.Thread(target=self.run_auto,name='automatic-video',daemon=True)
        self.auto_thread.start()

    def stop(self):
        self.stopping.set()
        self.wake.set()
        self.kill()
        self.terminate(self.cpu_process)
        if self.cpu_thread:self.cpu_thread.join(timeout=10)
        if self.auto_thread:self.auto_thread.join(timeout=10)
        if self.thread:
            self.thread.join(timeout=10)
        self.radio.close()
        if self.log:
            self.log.close()
        if all(not thread or not thread.is_alive() for thread in (self.thread,self.cpu_thread,self.auto_thread)):
            self.lease.release()

    def kill(self):
        process = self.process
        self.terminate(process)
        self.process = None
        self.status["model"] = "Not loaded"

    @staticmethod
    def terminate(process):
        if process and process.poll() is None:
            import psutil
            try:
                children=psutil.Process(process.pid).children(recursive=True)
                for child in children:child.terminate()
            except psutil.Error:children=[]
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            for child in children:
                try:
                    if child.is_running():child.kill()
                except psutil.Error:pass

    @submission_guard
    def enqueue(self, request: JobRequest, snapshot=None, submission_key=None, submission_identity=None, agent=None):
        from .submissions import identity
        key, fingerprint = submission_identity or identity('enqueue', submission_key, request.model_dump())
        previous = self.store.submitted_job(key, fingerprint)
        if previous: return previous
        project = self.store.load(request.projectId)
        gen = request.generation or project.generation
        if request.kind in ('separate','align','master','music-video','artwork','tokenize') and request.assetId and self.store.asset(request.assetId)['projectId'] != project.id:
            raise ValueError('Choose a source asset from this project')
        if request.kind in ('separate','align','master','music-video','tokenize') and not request.assetId:
            raise ValueError('Choose a source asset from this project')
        from .visual_api import validate_job
        request = validate_job(self.store, project, request)
        if request.kind in ("generate", "plan"):
            if not gen.style.strip():
                raise ValueError("Describe the musical style first")
            if gen.useScore and (gen.cot == "off" or not gen.abc.strip()):
                raise ValueError("An enabled score requires melody or melody + chord mode and nonempty ABC")
            if request.kind == "plan" and gen.cot == "off" and not gen.hum:
                raise ValueError("Score planning is off. Choose melody or melody + chords to create a score.")
            if gen.hum:
                from .hum_song import check_source
                check_source(self.store, project.id, gen.hum)
                if gen.useScore:
                    raise ValueError('Your edited Studio score is protected. Detach the hum or turn off Use saved ABC for next take before generating.')
            if not self.status["available"]:
                raise ValueError("YuE2 is not installed on this host. Use the GPU container to generate; all composition tools remain available.")
        from .model_runtime import check_downloads
        check_downloads(self.store.root,project,request)
        if request.kind in ('generate', 'plan'):
            request = request.model_copy(update={'generation': gen.model_copy(deep=True)})
        job = {"id": uid(), "projectId": project.id, "kind": request.kind, "state": "Queued", "createdAt": time.time(), "message": "Waiting for worker", "request": request.model_dump(), "generation": gen.model_dump(), "completed": [], "priority": 0, "projectRevision": project.revision}
        from .catalog import operation_name
        source=self.store.asset(request.assetId)['name'] if request.assetId else project.name
        if request.kind=='model-download':
            from .model_runtime import MODELS
            source=MODELS[request.options['modelId']]['name']
        job.update(name=source+' · '+operation_name(request.kind),projectName=project.name,sourceName=source)
        if request.kind in ('video','cover','export','music-video'):job['snapshot']=snapshot or project.model_dump()
        if request.kind=='align':job['timingBefore']=project.visuals.timing.model_dump()
        if agent:job['agent']={'id':agent['id'],'name':agent['name']}
        job = self.store.put_job(job, key, fingerprint)
        self.wake.set()
        return job

    def cancel(self, job_id):
        job = self.store.job(job_id)
        if job["state"] in TERMINAL:
            return job
        job = self.store.patch_job(job_id, state="Cancelled", message="Cancelled; completed candidates are retained")
        if self.current == job_id:
            self.kill()
        if self.cpu_current == job_id:
            self.terminate(self.cpu_process)
        if job['kind']=='music-video':
            for child in job.get('children',{}).values():self.cancel(child)
        return job

    @submission_guard
    def retry(self, job_id, approved_downloads=None, submission_key=None, agent=None):
        from .submissions import identity
        key, fingerprint = identity('retry:' + job_id, submission_key, {})
        previous = self.store.submitted_job(key, fingerprint)
        if previous: return previous
        old = self.store.job(job_id)
        if old["state"] not in TERMINAL:
            raise ValueError("Wait for the job to finish or cancel before retrying")
        request=JobRequest.model_validate({**old['request'],'approvedDownloads':list(set((old['request'].get('approvedDownloads',[]) if old['state']!='Complete' else [])+(approved_downloads or [])))})
        if old['kind'] in ('generate', 'plan') and old.get('generation'):
            from .schema import Generation
            request = request.model_copy(update={'generation': Generation.model_validate(old['generation'])})
        if old['state']=='Complete':return self.enqueue(request, submission_identity=(key,fingerprint), agent=agent)
        # Cancelled protection deliberately requires a fresh id for retry.
        if old["state"] == "Cancelled":
            return self.enqueue(request, submission_identity=(key,fingerprint), agent=agent)
        from .model_runtime import check_downloads
        from .schema import Project
        project=Project.model_validate(old['snapshot']) if old.get('snapshot') else self.store.load(old['projectId'])
        check_downloads(self.store.root,project,request)
        result = self.store.requeue_job(job_id, request.model_dump(), key, fingerprint)
        if agent:result=self.store.patch_job(result['id'],agent={'id':agent['id'],'name':agent['name']})
        self.wake.set()
        return result

    def ensure_process(self):
        if self.process is None or self.process.poll() is not None:
            if self.log is None:
                self.log = open(self.store.root / "logs" / "inference.log", "a", encoding="utf-8")
            self.process = subprocess.Popen([sys.executable, "-u", "-m", "backend.inference"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, text=True, encoding="utf-8", bufsize=1, cwd=str(__import__('pathlib').Path(__file__).resolve().parent.parent))
        return self.process

    def run_auto(self):
        from .auto_video import automatic_video
        while not self.stopping.is_set():
            job=self.store.claim_job(('music-video',))
            if not job:self.stopping.wait(.4);continue
            try:
                result=automatic_video(self,job)
                if self.store.job(job['id'])['state']!='Cancelled':
                    self.store.patch_job(job['id'],state='Complete',message=result['message'],result=result,progress=1)
            except InterruptedError:pass
            except Exception as exc:self.store.patch_job(job['id'],state='Failed',message=str(exc)[:1000])

    def run(self):
        while not self.stopping.is_set():
            job = self.store.claim_job(('generate','plan','separate','artwork','lyrics','align','tokenize','model-download'))
            if not job:
                station = self.radio.take()
                if station:
                    self.radio.generate(station)
                    continue
                self.wake.wait(.5)
                self.wake.clear()
                continue
            self.radio.release_writer()
            self.current = job["id"]
            try:
                if job["kind"] in ("generate", "plan"):
                    self.generate(job)
                elif job["kind"] == "separate":
                    self.separate(job)
                elif job['kind']=='model-download':
                    self.kill();self.run_child(job,'backend.maintenance_worker',False)
                elif job['kind']=='tokenize':
                    self.kill();self.status['model']='Real-audio tokenizer'
                    self.run_child(job,'backend.realaudio',False)
                elif job['kind'] in ('artwork','lyrics','align'):
                    self.kill()
                    self.status['model']={'artwork':'SDXL artwork','lyrics':'Qwen lyric assistant','align':'Lyric alignment'}[job['kind']]
                    self.run_child(job,'backend.alignment_worker' if job['kind']=='align' and job['request']['options'].get('backend','qwen3')=='qwen3' else 'backend.auxiliary',False)
                if self.store.job(job["id"])["state"] != "Cancelled":
                    self.store.patch_job(job["id"], state="Complete", message="Complete")
            except Exception as e:
                with open(self.store.root / "logs" / "worker.log", "a", encoding="utf-8") as f:
                    traceback.print_exc(file=f)
                self.store.patch_job(job["id"], state="Failed", message=str(e)[:1000])
            finally:
                self.current = None
                self.status["stage"] = "Ready"

    def run_child(self,job,module,cpu):
        from pathlib import Path
        import sysconfig
        env={**os.environ,'HF_HOME':str(self.store.root/'models'/'huggingface')}
        libraries=list((Path(sysconfig.get_paths()['purelib'])/'nvidia').glob('*/lib'))
        env['LD_LIBRARY_PATH']=':'.join(str(p) for p in libraries)+':'+env.get('LD_LIBRARY_PATH','')
        with open(self.store.root/'logs'/(job['id']+'.log'),'a',encoding='utf-8') as log:
            from .providers import alignment_python
            interpreter=alignment_python() if module=='backend.alignment_worker' else sys.executable
            if not interpreter:raise RuntimeError('The alignment runtime is not installed')
            process=subprocess.Popen([interpreter,'-u','-m',module],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,text=True,encoding='utf-8',env=env,cwd=str(Path(__file__).resolve().parent.parent))
            if cpu:self.cpu_process=process
            else:self.process=process
            process.stdin.write(json.dumps({'root':str(self.store.root),'job':job})+'\n');process.stdin.flush();process.stdin.close()
            done=False;error=None
            for line in process.stdout:
                try:event=json.loads(line)
                except json.JSONDecodeError:continue
                if event.get('error'):error=event['error']
                done=done or event.get('done',False)
                updates={k:v for k,v in event.items() if k in ('state','message','progress','result','seconds','visualAssetId','metrics','progressLabel','unitsDone','unitsTotal','unit','download')}
                if updates:self.store.patch_job(job['id'],**updates)
            code=process.wait()
            if self.store.job(job['id'])['state']=='Cancelled':return
            if code or not done:raise RuntimeError(error or 'Media worker stopped before completing. Retry the job.')
        if cpu:self.cpu_process=None
        else:self.process=None

    def run_cpu(self):
        while not self.stopping.is_set():
            job=self.store.claim_job(('video','cover','master','export','backup'))
            if not job:
                self.stopping.wait(.4);continue
            self.cpu_current=job['id']
            try:
                self.run_child(job,'backend.maintenance_worker' if job['kind']=='backup' else 'backend.visual_render',True)
                if self.store.job(job['id'])['state']!='Cancelled':self.store.patch_job(job['id'],state='Complete',message='Complete')
            except Exception as exc:
                self.store.patch_job(job['id'],state='Failed',message=str(exc)[:1000])
            finally:
                if job['kind']=='backup':
                    from .maintenance import cleanup_backup_work
                    cleanup_backup_work(self.store,job['id'])
                self.cpu_current=None

    def generate(self, job):
        for index in range(job["request"]["candidates"]):
            if self.stopping.is_set() or self.store.job(job["id"])["state"] == "Cancelled":
                return
            if index in self.store.job(job["id"])["completed"]:
                continue
            seed = job["generation"]["seed"] + index
            self.store.patch_job(job['id'],candidateIndex=index,progress=None,unitsDone=None,unitsTotal=None)
            output = self.store.project_dir(job["projectId"]) / "generation" / job["id"] / str(index)
            process = self.ensure_process()
            process.stdin.write(json.dumps({"root": str(self.store.root), "output": str(output), "generation": job["generation"], "seed": seed, "kind": job["kind"], "request":job['request']}) + "\n")
            process.stdin.flush()
            done = None
            for line in process.stdout:
                event = json.loads(line)
                if "error" in event:
                    raise RuntimeError(event["error"])
                if event.get("done"):
                    done = event
                    break
                self.status.update(stage=event.get("state", "Preparing"), model="Resident")
                self.store.patch_job(job["id"], **event, candidateIndex=index)
            if not done:
                if self.store.job(job["id"])["state"] == "Cancelled":
                    return
                raise RuntimeError("Inference process exited. See technical log and retry.")
            if self.store.job(job["id"])["state"] == "Cancelled":
                return
            self.store.patch_job(job["id"], state="Analyzing", message="Building waveforms and measuring audio")
            title=self.store.load(job['projectId']).name
            asset = ingest(self.store, job["projectId"], output / "audio.flac", f"{title} · Take {index+1} · {seed}", "yue2",{'jobId':job['id'],'candidateIndex':index,'seed':seed,'sourceAssetIds': [job['generation']['hum']['assetId']] if job['generation'].get('hum') else []}) if job["kind"] == "generate" else None
            candidate = Candidate(id=f"{job['id']}-{index}", name=f"Take {index+1} · {seed}", assetId=asset["id"] if asset else None, jobId=job["id"], seed=seed, abc=done.get("abc", ""), parentId=job["request"].get("parentId"), metadata={"generation": job["generation"], "timing": done.get("timing"), "truncated": done.get("truncated"), "adapters": done.get("adapters", []), "hum": done.get("hum"), "roleStatus": "Style guidance; vocalist roles are not calibrated"})
            def add(p):
                if not any(c.id == candidate.id for c in p.candidates):
                    p.candidates.append(candidate)
                if asset and not any(c.assetId or c.notes for t in p.tracks for c in t.clips):
                    from .schema import Track,Clip
                    p.tracks.append(Track(name='Song',type='ai',clips=[Clip(name=candidate.name,assetId=asset['id'],duration=asset['duration']*p.tempo/60,generationId=candidate.id)]))
                    if not p.creative.selectedCandidateId:p.creative.selectedCandidateId=candidate.id
            self.store.mutate(job["projectId"], add, "New YuE2 candidate")
            self.store.patch_job(job["id"], state="Saving", completed=self.store.job(job["id"])["completed"] + [index], message="Candidate saved", abc=done.get("abc", ""))

    def separate(self, job):
        if importlib.util.find_spec("demucs") is None:
            raise ValueError("Optional Demucs separation is not installed. Install the stems extra in the GPU image.")
        from .schema import Track, Clip
        path = self.store.asset_path(job["request"]["assetId"])
        out = self.store.project_dir(job["projectId"]) / "stems" / job["id"]
        self.store.patch_job(job["id"], state="Generating", message="Separating vocals, drums, bass and other with Demucs")
        self.kill()  # reserve GPU memory for the auxiliary model
        env = {**os.environ, 'TORCH_HOME': str(self.store.root/'cache'/'torch'), 'DAW_MODEL_ROOT':str(self.store.root),'DAW_JOB_REQUEST':json.dumps(job['request'])}
        process = subprocess.Popen([sys.executable, "-m", "backend.separate", str(path), str(out)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, env=env, cwd=str(__import__('pathlib').Path(__file__).resolve().parent.parent))
        self.process = process
        errors=[]
        for line in process.stderr:
            if line.startswith('CADENTRAIL_PROGRESS '):
                self.store.patch_job(job['id'],**json.loads(line[len('CADENTRAIL_PROGRESS '):]))
            else:errors.append(line);errors=errors[-30:]
        process.wait();err=''.join(errors)
        if self.store.job(job['id'])['state']=='Cancelled':return
        if process.returncode:
            raise RuntimeError("Source separation failed: " + err[-700:])
        self.store.patch_job(job['id'],state='Analyzing',message='Building stem waveforms and adding tracks')
        assets = [ingest(self.store, job["projectId"], p, p.stem, "demucs",{'sourceAssetIds':[job['request']['assetId']],'jobId':job['id']}) for p in sorted(out.rglob("*.wav"))]
        def add(p):
            for a in assets:
                p.tracks.append(Track(name=a["name"].title(), clips=[Clip(name=a["name"], assetId=a["id"], duration=a["duration"]*p.tempo/60)]))
        self.store.mutate(job["projectId"], add, "Separate stems")
