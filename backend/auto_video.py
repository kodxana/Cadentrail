"""Persistent beginner workflow, coordinated above the independent GPU/CPU lanes."""
import copy, time
from .schema import Project, JobRequest
from .visual_schema import VideoDesign, VideoScene
from .providers import capabilities, video_alignment

def confident_timing(timing,asset_id,lyrics=None):
    if timing.assetId!=asset_id or not timing.lines or any(l.start is None for l in timing.lines):return False
    if lyrics is not None and timing.sourceLyrics.strip()!=lyrics.strip():return False
    overlaps=[(a,b) for a,b in zip(timing.lines,timing.lines[1:]) if a.end>b.start]
    if overlaps and (timing.needsReview or any(not a.voice or not b.voice or a.voice==b.voice for a,b in overlaps)):return False
    if not timing.needsReview:return True
    words=[w for l in timing.lines for w in l.words]
    return bool(words) and (timing.coverage or 0)>=.98 and all(w.start is not None and (w.confidence or 0)>=.75 for w in words) and all(a.end<=b.start for a,b in zip(timing.lines,timing.lines[1:]))

def auto_design(project,asset_id,duration,backgrounds,options,lyric_ready):
    style=options['style'];preset=options['preset']
    d=VideoDesign(audioAssetId=asset_id,backgroundId=backgrounds[0] if backgrounds else None,kind='karaoke' if lyric_ready else 'visualizer',template='cinematic' if style=='cinematic' else 'clean',preset=preset,duration=options.get('duration'),font='serif' if style=='cinematic' else 'sans',fontSize=52 if preset=='vertical' else 58,lyricY=.72,visualizer='circle' if style=='energy' else 'bars',visualizerY=.42 if lyric_ready else .57,visualizerSize=.66,opacity=.65,sensitivity=1,thickness=3,motion='zoom',beatPulse=style!='clean',background='#171b25')
    if style=='energy':d.visualizerY=.43
    length=min(duration,options.get('duration') or duration)
    # Long, restrained scenes; no guessed cuts claimed as detected musical beats.
    if backgrounds:
        for i,start in enumerate(range(0,int(length),18)):
            d.scenes.append(VideoScene(type='image',assetId=backgrounds[i%len(backgrounds)],start=start,end=min(length,start+20),size=1,motion='pan' if i%2 else 'zoom',fade=1.5,opacity=1))
    if not lyric_ready:
        d.scenes.append(VideoScene(type='title',start=min(4,max(0,length-.1)),end=length,text=project.name,color='#f2ece2',x=.5,y=.76,size=.62,fade=1))
    return d

def automatic_video(worker,job):
    store=worker.store;project=Project.model_validate(job['snapshot']);options=job['request']['options'];asset_id=job['request']['assetId']
    available=capabilities();children=store.job(job['id']).get('children',{})
    def check():
        if worker.stopping.is_set():raise InterruptedError('Interrupted; retry to continue')
        if store.job(job['id'])['state']=='Cancelled':
            for child in children.values():worker.cancel(child)
            raise InterruptedError('Cancelled')
    def child(stage,request,snapshot=None):
        request=request.model_copy(update={'approvedDownloads':job['request'].get('approvedDownloads',[])})
        check();child_id=children.get(stage)
        if child_id:
            value=store.job(child_id)
            if value['state'] in ('Failed','Cancelled'):
                value=worker.retry(child_id,request.approvedDownloads);child_id=value['id']
        else:
            value=worker.enqueue(request,snapshot=snapshot);child_id=value['id']
        children[stage]=child_id;store.patch_job(job['id'],children=children)
        while True:
            check();value=store.job(child_id)
            store.patch_job(job['id'],state=value['state'] if value['state'] not in ('Queued','Complete') else 'Preparing assets',message=stage+' · '+value.get('message',''),progress=value.get('progress'),progressLabel=stage,unitsDone=value.get('unitsDone'),unitsTotal=value.get('unitsTotal'),unit=value.get('unit'),download=value.get('download',[]))
            if value['state']=='Complete':return value
            if value['state'] in ('Failed','Cancelled'):raise RuntimeError(stage+': '+value.get('message','Job stopped'))
            worker.stopping.wait(.4)
    backgrounds=[options.get('backgroundId') or project.visuals.cover.backgroundId or project.visuals.coverId]
    backgrounds=[x for x in backgrounds if x and any(a.id==x and a.kind!='video' for a in project.visuals.assets)]
    if not options.get('preview') and not backgrounds and available['artwork']['available']:
        prompt=options.get('prompt') or f"{project.generation.style}. Cinematic editorial illustration inspired by {project.name}. {project.generation.lyrics[:500]}. Rich atmosphere, beautiful light, clear composition, no text, no lettering."
        art=child('Creating artwork',JobRequest(projectId=project.id,kind='artwork',assetId=asset_id,options={'prompt':prompt,'aspect':'9:16' if options['preset']=='vertical' else '1:1' if options['preset']=='square' else '16:9','count':2,'seed':project.generation.seed,'steps':30}))
        backgrounds=[a.id for a in store.load(project.id).visuals.assets if a.jobId==art['id']]
    timing=project.visuals.timing
    if not options.get('preview') and options['lyrics'] and not confident_timing(timing,asset_id,project.generation.lyrics) and project.generation.lyrics.strip() and available['alignment']['available']:
        aligned=child('Aligning lyrics',JobRequest(projectId=project.id,kind='align',assetId=asset_id,options=video_alignment(options,project.generation.lyrics,available)))
        latest=store.load(project.id)
        timing=next((t for t in [latest.visuals.timing,*reversed(latest.visuals.timingHistory)] if t.jobId==aligned['id']),timing)
    ready=options['lyrics'] and confident_timing(timing,asset_id,project.generation.lyrics)
    project.visuals.assets=store.load(project.id).visuals.assets
    project.visuals.timing=timing.model_copy(deep=True)
    if ready:project.visuals.timing.needsReview=False
    d=auto_design(project,asset_id,store.asset(asset_id)['duration'],backgrounds,options,ready)
    if options.get('preview'):d.preview=True;d.duration=min(12,store.asset(asset_id)['duration'])
    render=child('Rendering music video',JobRequest(projectId=project.id,kind='video',options={'design':d.model_dump()}),project.model_dump())
    message='Music video ready · synchronized lyrics' if ready else 'Music video ready · artwork and audio-reactive visuals'
    return {'visualAssetId':render['result']['visualAssetId'],'message':message,'lyricsIncluded':bool(ready),'timingNeedsReview':bool(options['lyrics'] and project.generation.lyrics and not ready),'children':children}
