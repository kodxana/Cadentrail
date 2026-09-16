"""Bounded portable project restore; archives never control destination paths."""
import json,shutil,stat,tempfile,time,zipfile
from pathlib import Path,PurePosixPath
from .schema import Project,uid

FOLDERS={'audio','stems','generation','waveforms','spectrograms','scores','renders','visuals'}
def safe_relative(value):
    if not isinstance(value,str) or '\\' in value or ':' in value:
        raise ValueError('Invalid archive path')
    p=PurePosixPath(value)
    if p.is_absolute() or '..' in p.parts or not p.parts:
        raise ValueError('Invalid archive path')
    return p

def import_portable(store,source):
    with tempfile.TemporaryDirectory(dir=store.root/'temp',prefix='restore-') as temp:
        stage=Path(temp)
        with zipfile.ZipFile(source) as archive:
            infos=archive.infolist()
            if len(infos)>50000 or sum(i.file_size for i in infos)>8*1024**3:
                raise ValueError('Archive exceeds 8 GB expanded or 50,000 files')
            names=set()
            for i in infos:
                path=safe_relative(i.filename)
                if i.filename in names:raise ValueError('Archive contains duplicate paths')
                names.add(i.filename)
                if stat.S_ISLNK(i.external_attr>>16):raise ValueError('Archive links are not supported')
                if path.parts[0] not in FOLDERS and str(path) not in ('project.json','assets.json','checksums.json'):
                    raise ValueError('Archive contains an unsupported top-level entry')
                target=stage.joinpath(*path.parts)
                if i.is_dir():target.mkdir(parents=True,exist_ok=True)
                else:
                    target.parent.mkdir(parents=True,exist_ok=True)
                    with archive.open(i) as src,open(target,'wb') as dst:shutil.copyfileobj(src,dst,1024*1024)
        def load(name):
            path=stage/name
            if path.stat().st_size>64*1024**2:raise ValueError('Archive metadata exceeds 64 MB')
            return json.loads(path.read_text('utf-8'),parse_constant=lambda x:(_ for _ in ()).throw(ValueError('Nonfinite JSON')))
        if (stage/'checksums.json').is_file():
            import hashlib
            checks=load('checksums.json')
            if not isinstance(checks,dict) or len(checks)>50000:raise ValueError('Invalid checksum manifest')
            for name,expected in checks.items():
                path=stage.joinpath(*safe_relative(name).parts)
                if not path.is_file():raise ValueError('Backup file is missing')
                with path.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
                if actual!=expected:raise ValueError('Backup file checksum mismatch: '+name)
        p=Project.model_validate(load('project.json'));assets=load('assets.json')
        if not isinstance(assets,list) or len(assets)>5000:raise ValueError('Invalid asset manifest')
        mapping={}
        for asset in assets:
            old=asset['id']
            if old in mapping:raise ValueError('Duplicate asset id')
            path=safe_relative(asset['path'])
            if path.parts[0] not in FOLDERS or not stage.joinpath(*path.parts).is_file():raise ValueError('Missing asset file')
            if asset.get('originalPath'):
                # Older Windows exports used a platform separator in metadata.
                asset['originalPath']=asset['originalPath'].replace('\\','/')
                safe_relative(asset['originalPath'])
            for level in asset['peaks']['levels']:
                name=safe_relative(level['file'])
                if len(name.parts)!=1 or not (stage/'waveforms'/str(name)).is_file():raise ValueError('Missing waveform cache')
            asset['id']=mapping[old]=uid()
        for t in p.tracks:
            for c in t.clips:
                if c.assetId:
                    if c.assetId not in mapping:raise ValueError('Clip references a missing asset')
                    c.assetId=mapping[c.assetId]
        for c in p.candidates:
            if c.assetId:
                if c.assetId not in mapping:raise ValueError('Candidate references a missing asset')
                c.assetId=mapping[c.assetId]
        from .visual_api import remap_visual_audio
        remap_visual_audio(p,mapping)
        from .hum_song import remap_hum_sources
        remap_hum_sources(p,mapping)
        for asset in assets:
            if isinstance(asset.get('lineage'),dict):
                lineage=asset['lineage']
                lineage['sourceAssetIds']=[mapping.get(i,i) for i in lineage.get('sourceAssetIds',[])]
        for visual in p.visuals.assets:
            path=safe_relative(visual.path)
            if not stage.joinpath(*path.parts).is_file():raise ValueError('Missing visual asset file')
        for encoding in p.audioEncodings:
            if not (stage/'generation'/encoding.id/'semantic.npy').is_file():raise ValueError('Missing real-audio encoding')
        p.id,p.revision,p.createdAt=uid(),0,time.time();p.name+=' · restored';p.archived=False
        target=store.project_dir(p.id)
        for folder in FOLDERS:
            if (stage/folder).exists():shutil.copytree(stage/folder,target/folder,dirs_exist_ok=True)
        for asset in assets:store.add_asset(p.id,asset)
        return store.save(p,'Imported portable project',create=True)
