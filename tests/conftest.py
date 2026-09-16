"""Tests must never initialize the live workstation database."""
import atexit, os, shutil, uuid
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'.runtime'/('test-run-'+uuid.uuid4().hex)
root.mkdir(parents=True)
os.environ['DAW_STORAGE']=str(root/'app')
# Fixtures model both plain local installs and image bundles explicitly. Never
# write fixture weights into the real immutable model layers during image QA.
os.environ.pop('DAW_CORE_MODELS',None)
os.environ.pop('DAW_BUNDLED_TOOLS',None)
def pytest_configure(config):
    if not config.option.basetemp: config.option.basetemp=str(root/'fixtures')
def cleanup():
    # Only the unique directory created by this test process is removed.
    if root.parent.name=='.runtime' and root.name.startswith('test-run-'):shutil.rmtree(root,ignore_errors=True)
atexit.register(cleanup)
