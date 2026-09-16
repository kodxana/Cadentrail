"""Music browsing over existing project/asset records; no duplicate library database."""
import json
from pydantic import BaseModel


def timing_sources(asset, assets):
    """Only a full-length single-source master inherits the source's time axis."""
    sources=[asset['id']];current=asset
    while current.get('origin')=='master':
        parents=current.get('lineage',{}).get('sourceAssetIds',[])
        parent=assets.get(parents[0]) if len(parents)==1 else None
        if not parent or parent['id'] in sources or parent['projectId']!=asset['projectId']:break
        if abs(parent.get('duration',0)-current.get('duration',0))>.05:break
        sources.append(parent['id']);current=parent
    return sources


def library_index(store):
    with store.connect() as db:
        rows=db.execute("""SELECT json_object(
            'id',id,'name',json_extract(data,'$.name'),'artist',json_extract(data,'$.artist'),
            'favorite',json_extract(data,'$.favorite'),'archived',json_extract(data,'$.archived'),
            'tags',json_extract(data,'$.tags'),'updatedAt',updated,'tempo',json_extract(data,'$.tempo'),
            'trackCount',json_array_length(data,'$.tracks'),'candidates',json_extract(data,'$.candidates'),
            'visuals',json_object('coverId',json_extract(data,'$.visuals.coverId')),
            'generation',json_object('style',json_extract(data,'$.generation.style'))
            ) FROM projects ORDER BY updated DESC""")
        projects={p['id']:{**p,'favorite':bool(p.get('favorite')),'archived':bool(p.get('archived'))} for row in rows for p in [json.loads(row[0])]}
        assets=[json.loads(row[0]) for row in db.execute('SELECT data FROM assets')]
    by_asset={a["id"]:a for a in assets}
    result=[];tracks=[]
    for p in projects.values():
        cover=p.get('visuals',{}).get('coverId')
        result.append({k:p.get(k,default) for k,default in {'id':'','name':'','artist':'','favorite':False,'archived':False,'tags':[],'updatedAt':0,'tempo':120}.items()} | {'coverUrl':f"/api/projects/{p['id']}/visuals/{cover}" if cover else None,'trackCount':p.get('trackCount',0),'candidateCount':len(p.get('candidates',[])),'style':p.get('generation',{}).get('style','')})
    summary={p['id']:p for p in result}
    candidates={p['id']:{c['assetId']:c for c in p.get('candidates',[]) if c.get('assetId')} for p in projects.values()}
    for a in assets:
        p=projects.get(a['projectId'])
        if not p or not a.get('duration',0)>0:continue
        base=(store.root/'projects'/p['id']).resolve();path=(base/a['path']).resolve()
        if not path.is_relative_to(base) or not path.is_file():continue
        c=candidates[p['id']].get(a['id']);origin=a.get('origin','import')
        kind='stem' if origin=='demucs' else 'master' if origin=='master' else 'mix' if origin in ('export','render') else 'take' if c else 'audio'
        tracks.append({'id':a['id'],'projectId':p['id'],'title':p['name'],'artist':p.get('artist',''),'version':c['name'] if c else a['name'],'kind':kind,'duration':a['duration'],'favorite':c.get('favorite',False) if c else a.get('favorite',False),'candidateId':c['id'] if c else None,'coverUrl':summary[p['id']]['coverUrl'],'url':f"/api/assets/{a['id']}/audio",'archived':p.get('archived',False),'tags':p.get('tags',[]),'updatedAt':p['updatedAt'],'origin':origin,'timingAssetIds':timing_sources(a,by_asset)})
    for p in result:p['songCount']=sum(t['projectId']==p['id'] and t['kind']!='stem' for t in tracks)
    return {'projects':result,'tracks':tracks}


def register(app,store):
    @app.get('/api/library')
    def index():return library_index(store)

    class Favorite(BaseModel):
        favorite:bool

    @app.patch('/api/library/tracks/{asset_id}')
    def favorite(asset_id:str,data:Favorite):
        asset=store.asset(asset_id);project=store.load(asset['projectId'])
        if any(c.assetId==asset_id for c in project.candidates):
            def update(p):
                for c in p.candidates:
                    if c.assetId==asset_id:c.favorite=data.favorite
            store.mutate(project.id,update,'Favorite library take')
        else:
            with store.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                row=db.execute('SELECT data FROM assets WHERE id=?',(asset_id,)).fetchone()
                current=json.loads(row[0]);current['favorite']=data.favorite
                db.execute('UPDATE assets SET data=? WHERE id=?',(json.dumps(current),asset_id))
        return {'id':asset_id,'favorite':data.favorite}
