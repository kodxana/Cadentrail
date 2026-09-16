"""Download only the pinned mandatory music models while building the image."""
import hashlib,json,shutil
from pathlib import Path
from huggingface_hub import snapshot_download

manifest=json.loads(Path('/build/model_manifest.json').read_text())
destination=Path('/opt/cadentrail/core-models')
destination.mkdir(parents=True,exist_ok=True)
included={}
for key,spec in manifest.items():
    if not spec['core']:continue
    target=destination/key
    snapshot_download(spec['repo'],revision=spec['revision'],allow_patterns=[f['path'] for f in spec['files']],local_dir=target,max_workers=4)
    expected=json.loads((target/'weights_manifest.json').read_text())['files']
    for name,entry in expected.items():
        file=target/name
        with file.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
        assert digest==entry['sha256'],f'Weight integrity failed: {key}/{name}'
    for entry in spec['files']:
        assert (target/entry['path']).stat().st_size==entry['bytes'],entry['path']
    cache=target/'.cache'
    if cache.exists():shutil.rmtree(cache)
    included[key]=spec
    print('Baked and verified',spec['name'],spec['bytes'],'bytes',flush=True)
(destination/'manifest.json').write_text(json.dumps(included,indent=2)+'\n')
