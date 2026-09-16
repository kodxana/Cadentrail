"""Run inside the release container with --network none and empty /workspace."""
import json,sys,tempfile,hashlib,os
from pathlib import Path
sys.path.insert(0,'/app')
from backend.model_runtime import model_inventory,core_options
from backend.schema import JobRequest, Generation
from backend.model_runtime import check_downloads, INCLUDED_TOOLS, MODELS, model_path, ModelDownloadRequired
from yue2.pipeline import resolve_model

with tempfile.TemporaryDirectory() as directory:
    root=Path(directory)
    models=model_inventory(root)['models']
    assert {m['id'] for m in models if m['bundled']}=={'yue2','yue2-vae',*INCLUDED_TOOLS}
    assert all(m['ready'] and m['bundled'] for m in models if m['core'])
    assert all(m['ready'] and m['bundled'] for m in models if m['id'] in INCLUDED_TOOLS)
    assert all(not m['ready'] for m in models if not m['core'] and m['id'] not in INCLUDED_TOOLS)
    assert check_downloads(root,None,JobRequest(projectId='offline-check',kind='separate'))==[]
    try:check_downloads(root,None,JobRequest(projectId='offline-check',kind='tokenize',options={'reconstruct':False}))
    except ModelDownloadRequired as exc:assert [m['id'] for m in exc.detail['models']]==['mert']
    else:raise AssertionError('MERT still requires download consent')
    for key in INCLUDED_TOOLS:
        spec=MODELS[key];path=model_path(root,key)
        entries=spec.get('files',[{'path':spec.get('filename'),'sha256':spec.get('sha256')}])
        for entry in entries:
            file=path if key=='demucs' else path/entry['path']
            with file.open('rb') as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==entry['sha256']
    import torch
    from demucs.states import load_model
    model=load_model(torch.load(model_path(root,'demucs'),map_location='cpu',weights_only=False)).eval()
    assert model.sources==['drums','bass','other','vocals']
    head=torch.load(model_path(root,'realaudio-v4')/'tokenizer_head_joint_v4.pt',map_location='cpu',weights_only=True)
    adapter=torch.load(model_path(root,'realaudio-v4')/'nar_lora_joint_v4.pt',map_location='cpu',weights_only=True)
    assert 'model' in head and 'lora' in adapter and 'io' in adapter
    print('Offline Demucs and Mothersuperior checkpoints loaded',flush=True)
    assert check_downloads(root,None,JobRequest(projectId='offline-check',kind='generate'))==[]
    assert check_downloads(root,None,JobRequest(projectId='offline-check',kind='generate',generation=Generation(role='instrumental')))==[]
    from backend.music_adapters import load_tensors
    tensors=load_tensors(root,'instrumental-v1')
    assert len(tensors)==392 and all(torch.isfinite(t).all() for t in tensors.values())
    assert all('nar_' not in name for name in tensors)
    print('Offline instrumental safetensors checksum and tensors verified',flush=True)
    options=core_options(root)
    for key in ('model','vae'):
        # The upstream resolver verifies the actual runtime model files.
        resolved=resolve_model(options[key],local_files_only=True)
        print('Offline resolver:',key,str(resolved),flush=True)
    assert not (root/'models').exists()
    print(json.dumps({'coreIncluded':True,'includedTools':sorted(INCLUDED_TOOLS),'otherOptionalAbsent':True,'emptyPersistentCache':True,'modelBytes':sum(m['bytes'] for m in models if m['bundled'])}),flush=True)
