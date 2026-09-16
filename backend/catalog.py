"""A searchable view of the files already owned by a project; no second library."""
import hashlib,json,re
from pathlib import Path
from urllib.parse import quote
from fastapi.responses import FileResponse,Response
from pydantic import BaseModel,Field

def filename(name,extension):
    value=re.sub(r'[\x00-\x1f<>:"/\\|?*]','_',str(name)).strip(' .')[:180] or 'Untitled'
    return value if value.lower().endswith('.'+extension.lower()) else value+'.'+extension

def operation_name(kind):
    return {'generate':'Song takes','plan':'Score plan','lyrics':'Song assistant','artwork':'Artwork','align':'Lyric alignment','video':'Video render','music-video':'Automatic music video','cover':'Cover design','master':'Mastered audio','separate':'Stem separation','tokenize':'Audio encoding','export':'Export','backup':'Project backup','model-download':'Model download'}.get(kind,kind.replace('-',' ').title())

def project_files(store,project):
    entries=[];base=store.project_dir(project.id).resolve();seen=set()
    def add(key,name,kind,path=None,text=None,job=None,created=0,source='',ref=None):
        if path is not None:
            path=Path(path).resolve()
            if not path.is_relative_to(base) or not path.is_file():return
            seen.add(path);extension=path.suffix.lstrip('.');size=path.stat().st_size
            location=path.relative_to(base).as_posix()
        else:
            extension='json' if kind in ('Timing','Metadata') else 'abc' if kind=='Score' else 'txt'
            size=len(text.encode('utf-8'));location='Project document'
        entry_id=hashlib.sha256(key.encode()).hexdigest()[:24]
        entries.append({'id':entry_id,'name':name,'kind':kind,'extension':extension,'size':size,'createdAt':created,'jobId':job,'sourceName':source,'location':location,'url':f'/api/projects/{project.id}/files/{entry_id}','assetId':ref,'_path':path,'_text':text,'_key':key})
    assets=store.assets(project.id);asset_names={a['id']:a['name'] for a in assets}
    for a in assets:
        candidate=next((c for c in project.candidates if c.assetId==a['id']),None)
        name=candidate.name if candidate else a['name']
        add('audio:'+a['id'],name,'Audio',base/a['path'],job=candidate.jobId if candidate else a.get('lineage',{}).get('jobId'),created=a.get('createdAt',project.createdAt),source=a.get('origin',''),ref=a['id'])
    for a in project.visuals.assets:
        add('visual:'+a.id,a.name,'Video' if a.kind=='video' else 'Artwork',base/a.path,job=a.jobId,created=a.createdAt,source=asset_names.get(a.sourceAssetId,''),ref=a.id)
    for c in project.candidates:
        parts=c.id.rsplit('-',1)
        score_file=base/'generation'/c.jobId/parts[-1]/'score.abc'
        if c.abc and not score_file.is_file():add('score:'+c.id,c.name+' · Score','Score',text=c.abc,job=c.jobId,created=project.createdAt)
    for index,d in enumerate(project.creative.lyricDrafts):
        label={'arrange':'Instrumental arrangement','before-arrangement':'Previous arrangement','enhance':'Music description','before-description':'Previous description','before-lyrics':'Previous lyrics','generate':'Lyrics','rewrite':'Rewritten lyrics','continue':'Lyric continuation','rhyme':'Rhyme ideas'}.get(d.operation,'Writing')
        add('draft:'+d.id,f'{label} · Draft {index+1:02} · '+d.model.rsplit('/',1)[-1],'Lyrics',text=d.text,job=d.jobId,created=d.createdAt,source=d.model)
    if project.generation.lyrics.strip():add('current-lyrics',project.name+' · Lyrics','Lyrics',text=project.generation.lyrics,created=project.updatedAt,source='Current lyrics')
    if project.visuals.timing.lines:add('timing',project.name+' · Lyric timing','Timing',text=project.visuals.timing.model_dump_json(indent=2),job=project.visuals.timing.jobId,created=project.updatedAt)
    for path in sorted((base/'visuals').glob('*-alignment.json')):
        job=path.name.removesuffix('-alignment.json')
        add('alignment:'+job,project.name+' · Alignment evidence · '+job[:8],'Timing',path,job=job,created=path.stat().st_mtime,source='Measured words and voice activity')
    encodings={a.id:a for a in project.audioEncodings}
    for path in sorted((base/'generation').rglob('*')):
        if len(entries)>=10000:break
        if not path.is_file() or path.resolve() in seen:continue
        relative=path.relative_to(base/'generation');parts=relative.parts;job=parts[0]
        c=next((c for c in project.candidates if c.id==job+'-'+(parts[1] if len(parts)>2 else '')),None)
        name=encodings[job].name if job in encodings else c.name if c else 'Generation '+job[:8]
        kind={'.flac':'Audio','.wav':'Audio','.npy':'Tokens','.abc':'Score','.mid':'MIDI','.json':'Metadata'}.get(path.suffix)
        if not kind:continue
        label='Original audio' if path.stem=='audio' else path.stem.replace('_',' ')
        add('generation:'+relative.as_posix(),name+' · '+label,kind,path,job=job,created=path.stat().st_mtime)
    return sorted(entries,key=lambda e:e['createdAt'],reverse=True)

def register(app,store):
    @app.get('/api/projects/{project_id}/files')
    def files(project_id:str):
        return [{k:v for k,v in e.items() if not k.startswith('_')} for e in project_files(store,store.load(project_id))]

    @app.get('/api/projects/{project_id}/files/{file_id}')
    def download(project_id:str,file_id:str):
        entry=next((e for e in project_files(store,store.load(project_id)) if e['id']==file_id),None)
        if not entry:raise KeyError('Project file not found')
        name=filename(entry['name'],entry['extension'])
        if entry['_path']:return FileResponse(entry['_path'],filename=name,content_disposition_type='inline')
        return Response(entry['_text'],media_type='application/json' if entry['extension']=='json' else 'text/plain',headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(name)})

    class Rename(BaseModel):
        name:str=Field(min_length=1,max_length=180)

    @app.patch('/api/projects/{project_id}/files/{file_id}')
    def rename(project_id:str,file_id:str,data:Rename):
        project=store.load(project_id)
        entry=next((e for e in project_files(store,project) if e['id']==file_id),None)
        if not entry:raise KeyError('Project file not found')
        name=data.name.strip()
        if not name:raise ValueError('Enter a file name')
        key=entry['_key'];ref=entry['assetId']
        if key.startswith('audio:'):
            asset=store.asset(ref);asset['name']=name
            with store.connect() as db:db.execute('UPDATE assets SET data=? WHERE id=?',(json.dumps(asset),ref))
            def update(p):
                for candidate in p.candidates:
                    if candidate.assetId==ref:candidate.name=name
            store.mutate(project_id,update,'Rename audio')
        elif key.startswith('visual:'):
            def update(p):
                next(a for a in p.visuals.assets if a.id==ref).name=name
            store.mutate(project_id,update,'Rename visual asset')
        else:raise ValueError('Rename this item in its editor')
        return {'name':name}
