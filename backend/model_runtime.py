"""Pinned model inventory and explicit per-job download consent."""
from __future__ import annotations
import hashlib,json,os,shutil,time,urllib.request
from pathlib import Path
from .storage_usage import storage_usage

MODELS=json.loads(Path(__file__).with_name('model_manifest.json').read_text())
INCLUDED_TOOLS=frozenset(json.loads(Path(__file__).with_name('tool_model_manifest.json').read_text()))

class ModelDownloadRequired(Exception):
    def __init__(self,detail):
        super().__init__('Optional models need your permission to download')
        self.detail=detail

def bundle_root():
    value=os.getenv('DAW_CORE_MODELS')
    return Path(value) if value else None

def bundled_path(key):
    if MODELS[key]['core'] and bundle_root():return bundle_root()/key
    tools=os.getenv('DAW_BUNDLED_TOOLS')
    if tools and key in INCLUDED_TOOLS:
        path=Path(tools)/key
        return path/MODELS[key]['filename'] if key=='demucs' else path
    return None

def cache_dir(root,spec):
    return Path(root)/'models'/('whisper' if spec['id']=='whisper' else 'huggingface/hub')

def model_path(root,key):
    spec=MODELS[key]
    included=bundled_path(key)
    if included is not None:return included
    if key=='demucs':return Path(root)/'cache/torch/hub/checkpoints'/spec['filename']
    return cache_dir(root,spec)/('models--'+spec['repo'].replace('/','--'))/'snapshots'/spec['revision']

def inventory(root,key):
    spec=MODELS[key];path=model_path(root,key)
    if key=='demucs':
        missing=0 if path.is_file() and path.stat().st_size==spec['bytes'] else spec['bytes']
    else:
        missing=sum(f['bytes'] for f in spec['files'] if not (path/f['path']).is_file() or (path/f['path']).stat().st_size!=f['bytes'])
    return {'id':key,'name':spec['name'],'repo':spec['repo'],'bytes':spec['bytes'],'missingBytes':missing,'ready':missing==0,'core':spec['core'],'bundled':bundled_path(key) is not None,'sizeEstimated':False,**({'license':spec['license']} if spec.get('license') else {})}

def model_inventory(root):
    storage=storage_usage(root)
    return {'models':[inventory(root,key) for key in MODELS],'freeBytes':storage['availableBytes'],'storage':storage}

def key_for_repo(repo):
    for key,spec in MODELS.items():
        if spec.get('repo')==repo:return key
    raise ValueError('This model needs a reviewed download manifest before it can be offered by the workstation')

def alignment_models(options):
    if options.get('backend','qwen3')=='whisper':return ['whisper']
    return ['qwen-asr','qwen-aligner','whisper']+(['sortformer'] if options.get('detectVoices',True) else [])+(['demucs'] if options.get('isolateVocals',False) else [])


def required_models(root,project,request):
    kind=request.kind;options=request.options
    if kind=='model-download':return [options['modelId']]
    if kind in ('generate','plan'):
        from .music_adapters import adapter_keys
        generation=request.generation or (project.generation if project else None)
        return ['yue2','yue2-vae'] + (adapter_keys(generation.model_dump()) if generation else [])
    if kind=='artwork':return [key_for_repo(os.getenv('DAW_ARTWORK_MODEL','stabilityai/stable-diffusion-xl-base-1.0'))]
    if kind=='lyrics':
        from .providers import text_model
        return [key_for_repo(text_model(options.get('model')))]
    if kind=='align':return alignment_models(options)
    if kind=='separate':return ['demucs']
    if kind=='tokenize':return ['mert','realaudio-v4']+(['yue2','yue2-vae'] if options.get('reconstruct',True) else [])
    if kind=='music-video':
        if options.get('preview'):return []
        from .providers import capabilities
        from .auto_video import confident_timing
        available=capabilities();result=[]
        background=options.get('backgroundId') or project.visuals.cover.backgroundId or project.visuals.coverId
        has_background=any(a.id==background and a.kind!='video' for a in project.visuals.assets)
        if not has_background and available['artwork']['available']:
            result.append(key_for_repo(os.getenv('DAW_ARTWORK_MODEL','stabilityai/stable-diffusion-xl-base-1.0')))
        if options.get('lyrics',True) and project.generation.lyrics.strip() and not confident_timing(project.visuals.timing,request.assetId,project.generation.lyrics) and available['alignment']['available']:
            from .providers import video_alignment
            result.extend(alignment_models(video_alignment(options, project.generation.lyrics, available)))
        return result
    return []

def check_downloads(root,project,request):
    missing=[inventory(root,key) for key in required_models(root,project,request)]
    missing=[m for m in missing if not m['ready']]
    if any(m['bundled'] for m in missing):raise ValueError('An included model is incomplete. Pull the complete Cadentrail image again.')
    unapproved=[m for m in missing if m['id'] not in request.approvedDownloads]
    storage=storage_usage(root,refresh=bool(missing));free=storage['availableBytes']
    if unapproved:raise ModelDownloadRequired({'code':'model_download_required','models':unapproved,'freeBytes':free,'storage':storage,'downloadBytes':sum(m['missingBytes'] for m in unapproved)})
    needed=sum(m['missingBytes'] for m in missing)
    if needed and free is not None and free<needed+min(2*1024**3,needed//5):raise ValueError('Not enough persistent storage for the selected model download. Free space or choose a smaller model.')
    return missing

def prepare_models(root,project,request,emit):
    """Download only models explicitly approved for this job; cached models need no consent."""
    missing=check_downloads(root,project,request)
    if not missing:return
    (Path(root)/'models').mkdir(parents=True,exist_ok=True)
    from filelock import FileLock
    from .download_progress import install_download_progress
    install_download_progress(emit)
    with FileLock(str(Path(root)/'models'/'optional-download.lock')):
        for model in missing:
            key=model['id'];spec=MODELS[key]
            if inventory(root,key)['ready']:continue
            if key=='demucs':
                destination=model_path(root,key);destination.parent.mkdir(parents=True,exist_ok=True)
                temporary=destination.with_suffix('.partial');done=0;last=0
                with urllib.request.urlopen(spec['url'],timeout=90) as response,temporary.open('wb') as output:
                    total=int(response.headers.get('Content-Length') or spec['bytes'])
                    while block:=response.read(1024*1024):
                        output.write(block);done+=len(block)
                        if time.monotonic()-last>.4:
                            emit(state='Downloading models',message=spec['name']+' · '+spec['filename'],progress=done/total,progressLabel='Current model file',unitsDone=done,unitsTotal=total,unit='bytes',download=[{'name':spec['filename'],'model':spec['repo'],'completed':done,'total':total,'state':'Downloading'}]);last=time.monotonic()
                with temporary.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
                if not digest.startswith(spec['sha256Prefix']):raise ValueError('Stem model download failed its checksum')
                temporary.replace(destination)
            else:
                from huggingface_hub import snapshot_download
                snapshot_download(spec['repo'],revision=spec['revision'],allow_patterns=[f['path'] for f in spec['files']],cache_dir=cache_dir(root,spec),max_workers=2)
            if not inventory(root,key)['ready']:raise ValueError('The model download is incomplete; retry to resume it')

def core_options(root):
    for key in ('yue2','yue2-vae'):
        if not inventory(root,key)['ready']:raise ValueError('Required music models are missing from this installation')
    return {'model':str(model_path(root,'yue2')),'vae':str(model_path(root,'yue2-vae')),'local_files_only':True}
