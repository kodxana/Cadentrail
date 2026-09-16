"""Check release configuration, layer depth, and optionally archived layer contents."""
import argparse
import json
import subprocess
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('image')
parser.add_argument('--audit', action='store_true', help='Stream the image archive and check model files occur in only one layer')
parser.add_argument('--output', help='Write JSON evidence')
args = parser.parse_args()
image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', args.image]))[0]
layers = image['RootFS']['Layers']
config = image['Config']
assert len(layers) < 96, f'{len(layers)} layers: rebuild with the shallow layout before publishing'
assert config['Entrypoint'] == ['/usr/bin/tini', '--', '/usr/local/bin/studio-start']
assert config['WorkingDir'] == '/app' and '/workspace' in config['Volumes']
env = dict(item.split('=', 1) for item in config['Env'])
assert env['DAW_CORE_MODELS'] == '/opt/cadentrail/core-models'
assert env['DAW_BUNDLED_TOOLS'] == '/opt/cadentrail/bundled-tools'
assert env['DAW_STORAGE'] == '/workspace/yue2-daw'
assert env['NVIDIA_DRIVER_CAPABILITIES'] == 'compute,utility'
assert not env.get('DAW_PASSWORD')
assert config.get('Healthcheck') and '8000/tcp' in config['ExposedPorts']
result = {'image': args.image, 'layers': len(layers), 'sizeBytes': image['Size'],
          'runtimeConfiguration': 'verified', 'layerDigests': layers}
if args.audit:
    # docker save streams uncompressed layer blobs; inspect names without extracting files.
    process = subprocess.Popen(['docker', 'image', 'save', args.image], stdout=subprocess.PIPE)
    expected = None
    found = set()
    model_files = {}
    layout = []
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|', bufsize=1024*1024) as outer:
            for entry in outer:
                digest = entry.name.rsplit('/', 1)[-1]
                if entry.name == 'manifest.json':
                    manifests = json.load(outer.extractfile(entry))
                    expected = set(manifests[0]['Layers'])
                    continue
                if not entry.isfile() or entry.size == 0 or not (entry.name.startswith('blobs/sha256/') or entry.name.endswith('/layer.tar')):
                    continue
                try:
                    inner = tarfile.open(fileobj=outer.extractfile(entry), mode='r|*', bufsize=1024*1024)
                except tarfile.ReadError:
                    continue
                found.add(entry.name)
                counts = {'digest': 'sha256:' + digest, 'files': 0, 'modelBytes': 0,
                          'appBytes': 0, 'modelSets': []}
                sets = set()
                with inner:
                    for file in inner:
                        if not file.isfile():
                            continue
                        counts['files'] += 1
                        name = file.name.removeprefix('./').lstrip('/')
                        if name.startswith('app/'):
                            counts['appBytes'] += file.size
                        for prefix in ('opt/cadentrail/core-models/', 'opt/cadentrail/bundled-tools/'):
                            if not name.startswith(prefix):
                                continue
                            relative = name[len(prefix):]
                            if '/' not in relative:  # Small inventory manifests belong with app metadata.
                                continue
                            assert name not in model_files, f'Model file duplicated in layers: {name}'
                            model_files[name] = file.size
                            counts['modelBytes'] += file.size
                            sets.add(relative.split('/', 1)[0])
                counts['modelSets'] = sorted(sets)
                layout.append(counts)
                print('Audited layer', len(layout), 'model sets:', ', '.join(counts['modelSets']) or 'none', flush=True)
        assert process.wait() == 0, 'docker save failed'
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
    assert expected is not None and found == expected and len(layout) == len(layers), 'The Docker archive format did not expose every expected layer'
    model_layers = [layer for layer in layout if layer['modelSets']]
    assert all(len(layer['modelSets']) == 1 and layer['appBytes'] == 0 for layer in model_layers)
    assert sorted(s for layer in model_layers for s in layer['modelSets']) == sorted([
        'yue2', 'yue2-vae', 'realaudio-v4', 'demucs', 'sortformer', 'instrumental-v1'])
    assert sum(bool(layer['appBytes']) for layer in layout) == 1
    result.update(layerLayout=layout, modelFiles=len(model_files),
                  archivedModelBytes=sum(model_files.values()), duplicatedModelFiles=0)
if args.output:
    from pathlib import Path
    Path(args.output).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
