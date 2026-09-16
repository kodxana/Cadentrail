"""Run source regression checks against /app/backend in a disposable container."""
from pathlib import Path
import os,shutil,subprocess,sys,tempfile,json,hashlib
source=Path('/qa')
with tempfile.TemporaryDirectory(prefix='cadentrail-check-') as directory:
    root=Path(directory)
    for name in ['tests','scripts']:
        shutil.copytree(source/name,root/name,ignore=shutil.ignore_patterns('__pycache__','browser'))
    shutil.copytree('/app/backend',root/'backend',ignore=shutil.ignore_patterns('__pycache__'))
    for name in ['package.json','pyproject.toml','Dockerfile']:
        shutil.copyfile(source/name,root/name)
    # Verify the actual image before isolating the regression test fixtures.
    sys.path.insert(0,str(root))
    from backend.model_runtime import model_inventory, INCLUDED_TOOLS
    (root/'storage').mkdir()
    inventory=model_inventory(root/'storage')
    core=[m for m in inventory['models'] if m['core']]
    assert core and all(m['ready'] and m['bundled'] for m in core)
    assert all(m['ready'] and m['bundled'] for m in inventory['models'] if m['id'] in INCLUDED_TOOLS)
    assert all(not m['ready'] for m in inventory['models'] if not m['core'] and m['id'] not in INCLUDED_TOOLS)
    print(json.dumps({'coreModels':[m['id'] for m in core],'includedTools':sorted(INCLUDED_TOOLS)}),flush=True)
    env={**os.environ,'DAW_STORAGE':str(root/'storage')}
    subprocess.run([sys.executable,'-m','pytest','-q','--tb=short'],cwd=root,env=env,check=True)
