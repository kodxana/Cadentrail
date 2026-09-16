"""Bake pinned companion models in a layer separate from YuE2."""
import hashlib,json,shutil,urllib.request
from pathlib import Path
from huggingface_hub import snapshot_download

manifest=json.loads(Path('/build/tool_model_manifest.json').read_text())
destination=Path('/opt/cadentrail/bundled-tools')
destination.mkdir(parents=True,exist_ok=True)
for key,spec in manifest.items():
    target=destination/key;target.mkdir(exist_ok=True)
    entries=spec.get('files',[{'path':spec.get('filename'),'bytes':spec['bytes'],'sha256':spec.get('sha256')}])
    def verified(entry):
        file=target/entry['path']
        if not file.is_file() or file.stat().st_size!=entry['bytes']: return False
        with file.open('rb') as source: return hashlib.file_digest(source,'sha256').hexdigest()==entry['sha256']
    if all(verified(entry) for entry in entries):
        print('Retained verified',spec['name'],flush=True)
        continue
    if 'url' in spec:
        files=[{'path':spec['filename'],'bytes':spec['bytes'],'sha256':spec['sha256']}]
        with urllib.request.urlopen(spec['url'],timeout=120) as source,(target/spec['filename']).open('wb') as out:
            shutil.copyfileobj(source,out,1024*1024)
    else:
        files=spec['files']
        snapshot_download(spec['repo'],revision=spec['revision'],allow_patterns=[f['path'] for f in files],local_dir=target,max_workers=2)
    for entry in files:
        file=target/entry['path']
        assert file.stat().st_size==entry['bytes'],f"Incomplete model: {key}/{entry['path']}"
        with file.open('rb') as source:digest=hashlib.file_digest(source,'sha256').hexdigest()
        assert digest==entry['sha256'],f"Model checksum failed: {key}/{entry['path']}"
    cache=target/'.cache'
    if cache.exists():shutil.rmtree(cache)
    print('Baked and SHA-256 verified',spec['name'],spec['bytes'],'bytes',flush=True)
(destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
