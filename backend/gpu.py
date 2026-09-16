"""Live device-wide VRAM telemetry without loading a model or CUDA context."""
import csv, io, math, subprocess, threading, time
_lock=threading.Lock()
_cached=None
_checked=0.0

def number(value):
    try:
        result=float(value.strip())
        return result if math.isfinite(result) and result>=0 else None
    except (ValueError,TypeError):return None

def parse_gpu_csv(text):
    devices=[]
    for row in csv.reader(io.StringIO(text)):
        if len(row)!=6:continue
        name,used,total,util,temp,index=(v.strip() for v in row)
        total=number(total);used=number(used)
        if total is None or total<=0 or used is None:continue
        devices.append({'index':index,'name':name,'usedBytes':int(used*1024**2),'totalBytes':int(total*1024**2),'utilization':number(util),'temperature':number(temp)})
    return devices

def gpu_status():
    global _cached,_checked
    with _lock:
        now=time.monotonic()
        if _cached is not None and now-_checked<1.5:return _cached
        _checked=now
        try:
            result=subprocess.run(['nvidia-smi','--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu,index','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=2,check=True)
            devices=parse_gpu_csv(result.stdout)
            _cached={'available':bool(devices),'devices':devices,'sampledAt':time.time(),'message':None if devices else 'GPU memory telemetry unavailable'}
        except FileNotFoundError:
            _cached={'available':False,'devices':[],'sampledAt':None,'message':'No NVIDIA GPU on this host'}
        except (OSError,subprocess.SubprocessError):
            _cached={'available':False,'devices':[],'sampledAt':None,'message':'GPU telemetry is temporarily unavailable'}
        return _cached
