"""Visual media uses the existing project, file tree, revisions and queue."""
import json, os, subprocess, time
from pathlib import Path
from typing import Literal
from fastapi import UploadFile, File
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, ConfigDict
from starlette.concurrency import run_in_threadpool
from PIL import Image, ImageOps
from .schema import uid
from .visual_schema import VisualAsset, CoverDesign, VideoDesign
from .providers import capabilities
from .visual_render import visual_path

class Options(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)

class ArtworkOptions(Options):
    prompt: str = Field(min_length=1,max_length=12000)
    negativePrompt: str = Field('text, letters, watermark, signature, blurry',max_length=4000)
    aspect: Literal['1:1','16:9','9:16','4:5'] = '1:1'
    count: Literal[1,2,4] = 1
    seed: int = Field(831001,ge=0,le=2**53-9)
    steps: int = Field(30,ge=15,le=50)
    candidateId: str | None = None
    parentId: str | None = None

from .radio_language import RadioLanguage

class TextOptions(Options):
    model: str | None = Field(None,max_length=200)
    operation: Literal['generate','rewrite','continue','enhance','rhyme','arrange'] = 'generate'
    title: str = Field('',max_length=180)
    style: str = Field('',max_length=8000)
    direction: str = Field('',max_length=4000)
    lyrics: str = Field('',max_length=30000)
    language: RadioLanguage = 'auto'
    instrumental: bool = False
    sections: str = Field('',max_length=2000)
    seed: int = Field(831001,ge=0,le=2**53-9)

class AlignOptions(Options):
    lyrics: str = Field(min_length=1,max_length=30000)
    language: str = Field('auto',pattern=r'^(auto|[a-z]{2,3})$')
    backend: Literal['qwen3','whisper'] = 'qwen3'
    detectVoices: bool = True
    maxVoices: Literal[2,4] = 2
    isolateVocals: bool = False

class MasterOptions(Options):
    format: Literal['wav','flac','mp3'] = 'wav'
    lufs: float = Field(-14,ge=-24,le=-9)
    sampleRate: Literal[44100,48000,96000] = 48000
    bitDepth: Literal[16,24,32] = 24
    bitrate: Literal[192,256,320] = 320

class AutoVideoOptions(Options):
    preview: bool = False
    alignmentBackend: Literal['auto','qwen3','whisper'] = 'auto'
    detectVoices: bool = True
    preset: Literal['1080p','vertical','square'] = '1080p'
    style: Literal['cinematic','clean','energy'] = 'cinematic'
    prompt: str = Field('',max_length=12000)
    backgroundId: str | None = None
    lyrics: bool = True
    duration: float | None = Field(None,gt=0,le=1200)

class TokenizeOptions(Options):
    reconstruct: bool = True
    start: float = Field(0,ge=0,le=1200)
    duration: float = Field(30,ge=1,le=180)
    seed: int = Field(831001,ge=0,le=2**53-9)
    odeSteps: Literal[16,32,48,64] = 32


def validate_job(store,project,request):
    kind=request.kind;options=request.options
    if kind=='model-download':
        from .model_runtime import MODELS
        key=options.get('modelId');spec=MODELS.get(key)
        if not spec or spec['core']:raise ValueError('Choose an optional model from this workstation')
        options={'modelId':key}
    if kind=='backup':
        ids=options.get('projectIds',[project.id])
        if not isinstance(ids,list) or not 1<=len(ids)<=1000 or any(not isinstance(i,str) for i in ids):raise ValueError('Choose 1–1000 projects to back up')
        ids=list(dict.fromkeys(ids))
        for project_id in ids:store.load(project_id)
        options={'projectIds':ids}
    if kind in ('artwork','lyrics','align'):
        key={'artwork':'artwork','lyrics':'text','align':'alignment'}[kind]
        if not capabilities()[key]['available']:raise ValueError(f'{key.title()} provider is unavailable on this host')
        model={'artwork':ArtworkOptions,'lyrics':TextOptions,'align':AlignOptions}[kind]
        options=model.model_validate(options).model_dump()
        if kind=='align' and options['backend']=='qwen3':
            from .providers import alignment_python
            if not alignment_python():raise ValueError('Qwen lyric alignment is unavailable on this installation. Use the current GPU image or select Whisper legacy.')
            if options['language'] not in ('auto','en','zh','yue','fr','de','it','ja','ko','pt','ru','es'):raise ValueError('Qwen word alignment supports English, Chinese, Cantonese, French, German, Italian, Japanese, Korean, Portuguese, Russian and Spanish. Select Whisper legacy for another language.')
        if kind=='lyrics':
            from .providers import text_model
            options['model']=text_model(options.get('model'))
            from .song_assistance import assistance_language, LYRIC_OPERATIONS
            from .music_adapters import role_for
            options['instrumental']=options['instrumental'] or role_for(project.generation.model_dump())=='instrumental'
            if options['operation'] in LYRIC_OPERATIONS:
                if options['instrumental']:raise ValueError('Choose description or arrangement assistance for an instrumental, or enable vocals to write lyrics.')
                options['language']=assistance_language(options)
    if kind=='artwork':
        if options['parentId']:visual_path(store,project,options['parentId'])
        if options['candidateId'] and not any(c.id==options['candidateId'] for c in project.candidates):raise ValueError('Choose a candidate from this project')
    if kind=='video':
        design=VideoDesign.model_validate(options.get('design',project.visuals.video.model_dump()))
        if not design.audioAssetId or store.asset(design.audioAssetId)['projectId']!=project.id:raise ValueError('Choose audio from this project')
        if design.backgroundId:visual_path(store,project,design.backgroundId)
        videos=0
        for scene in design.scenes:
            if scene.assetId:
                asset,_=visual_path(store,project,scene.assetId)
                videos+=asset.kind=='video'
        if videos>2:raise ValueError('Use at most two video background clips per render')
        options={'design':design.model_dump()}
    if kind=='cover':
        design=CoverDesign.model_validate(options.get('design',project.visuals.cover.model_dump()))
        if design.backgroundId:visual_path(store,project,design.backgroundId)
        options={'design':design.model_dump()}
    if kind=='master':options=MasterOptions.model_validate(options).model_dump()
    if kind=='music-video':
        options=AutoVideoOptions.model_validate(options).model_dump()
        from .providers import video_alignment
        if options['lyrics']:
            options['alignmentBackend']=video_alignment(options, project.generation.lyrics)['backend']
        if options['backgroundId']:visual_path(store,project,options['backgroundId'])
    if kind=='tokenize':
        if not capabilities()['realaudio']['available']:raise ValueError('Real-audio tokenization requires the GPU runtime')
        options=TokenizeOptions.model_validate(options).model_dump()
    return request.model_copy(update={'options':options})

def remap_visual_audio(project,mapping):
    for a in project.audioEncodings:
        a.sourceAssetId=mapping.get(a.sourceAssetId,a.sourceAssetId)
        a.resultAssetId=mapping.get(a.resultAssetId,a.resultAssetId)
    v=project.visuals
    v.timing.assetId=mapping.get(v.timing.assetId,v.timing.assetId)
    v.video.audioAssetId=mapping.get(v.video.audioAssetId,v.video.audioAssetId)
    for t in v.timingHistory:t.assetId=mapping.get(t.assetId,t.assetId)
    for a in v.assets:
        a.sourceAssetId=mapping.get(a.sourceAssetId,a.sourceAssetId)
        if isinstance(a.settings.get('design'),dict):
            d=a.settings['design'];d['audioAssetId']=mapping.get(d.get('audioAssetId'),d.get('audioAssetId'))
        if isinstance(a.settings.get('timing'),dict):
            t=a.settings['timing'];t['assetId']=mapping.get(t.get('assetId'),t.get('assetId'))

def register(app,store):
    @app.post('/api/projects/{project_id}/cover-preview')
    def preview_cover(project_id:str,design:CoverDesign):
        import io
        from .visual_render import cover_image
        buffer=io.BytesIO();cover_image(store,store.load(project_id),design.model_dump(),size=640).save(buffer,format='PNG')
        return Response(buffer.getvalue(),media_type='image/png')
    @app.get('/api/projects/{project_id}/encodings/{encoding_id}')
    def encoding(project_id:str,encoding_id:str):
        project=store.load(project_id)
        item=next((x for x in project.audioEncodings if x.id==encoding_id),None)
        if not item:raise KeyError('Encoding not found')
        from .catalog import filename
        return FileResponse(store.project_dir(project_id)/'generation'/encoding_id/'semantic.npy',filename=filename(item.name,'npy'))
    @app.get('/api/providers')
    def providers():return capabilities()

    @app.get('/api/projects/{project_id}/visuals/{asset_id}')
    def media(project_id:str,asset_id:str):
        asset,path=visual_path(store,store.load(project_id),asset_id)
        return FileResponse(path,filename=asset.name+path.suffix,content_disposition_type='inline')

    @app.post('/api/projects/{project_id}/visuals/import')
    async def upload(project_id:str,file:UploadFile=File(...)):
        store.load(project_id);extension=Path(file.filename or '').suffix.lower()
        if extension not in ('.jpg','.jpeg','.png','.webp','.mp4','.mov','.webm'):
            raise ValueError('Upload PNG, JPEG, WebP, MP4, MOV or WebM')
        folder=store.project_dir(project_id)/'visuals';asset_id=uid();target=folder/(asset_id+'-original'+extension)
        total=0
        try:
            with open(target,'wb') as stream:
                while chunk:=await file.read(1024*1024):
                    total+=len(chunk)
                    if total>1024**3:raise ValueError('Visual upload exceeds 1 GB')
                    stream.write(chunk)
            def ingest():
                if extension in ('.jpg','.jpeg','.png','.webp'):
                    with Image.open(target) as original:
                        if original.width*original.height>40_000_000:raise ValueError('Image exceeds 40 megapixels')
                        image=ImageOps.exif_transpose(original).convert('RGB');image.thumbnail((4096,4096),Image.Resampling.LANCZOS)
                        path=folder/(asset_id+'.png');image.save(path);width,height=image.size;duration=None;kind='image'
                else:
                    probe=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(target)],capture_output=True,text=True,timeout=30)
                    if probe.returncode:raise ValueError('Video could not be read')
                    info=json.loads(probe.stdout);v=next((s for s in info['streams'] if s['codec_type']=='video'),None)
                    if not v:raise ValueError('File has no video stream')
                    width,height=v['width'],v['height'];duration=float(info['format'].get('duration',0));kind='video';path=target
                    if width*height>3840*2160 or not 0<duration<=1200:raise ValueError('Video backgrounds support up to 4K and twenty minutes')
                asset=VisualAsset(id=asset_id,name=file.filename or 'Visual media',kind=kind,path='visuals/'+path.name,width=width,height=height,duration=duration,createdAt=time.time(),model='uploaded',settings={'originalPath':'visuals/'+target.name})
                store.mutate(project_id,lambda p:p.visuals.assets.append(asset),'Import visual media');return asset
            return await run_in_threadpool(ingest)
        except Exception:
            target.unlink(missing_ok=True);raise
