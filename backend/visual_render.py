"""Deterministic server composition from original audio; no browser capture."""
from __future__ import annotations
import functools, json, math, os, subprocess, time
from pathlib import Path
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont, ImageOps
from .audio import ffmpeg
from .visual_schema import VisualAsset, CoverDesign, VideoDesign, LyricTiming

PRESETS={'1080p':(1920,1080,30),'1080p60':(1920,1080,60),'1440p':(2560,1440,30),'4k':(3840,2160,30),'vertical':(1080,1920,30),'square':(1080,1080,30)}

@functools.lru_cache(maxsize=80)
def font(kind,size):
    names={'sans':'DejaVuSans','serif':'DejaVuSerif','mono':'DejaVuSansMono'}
    paths=[Path('/usr/share/fonts/truetype/dejavu')/(names[kind]+'.ttf'),Path('C:/Windows/Fonts')/({'sans':'arial.ttf','serif':'georgia.ttf','mono':'consola.ttf'}[kind])]
    for path in paths:
        if path.exists():return ImageFont.truetype(str(path),max(8,int(size)))
    return ImageFont.truetype('DejaVuSans.ttf',max(8,int(size)))

def visual_path(store,project,asset_id):
    asset=next((a for a in project.visuals.assets if a.id==asset_id),None)
    if not asset:raise ValueError('Choose visual media from this project')
    base=store.project_dir(project.id).resolve();path=(base/asset.path).resolve()
    if not path.is_relative_to(base/'visuals') or not path.is_file():raise ValueError('Visual file is missing')
    return asset,path

def fit(image,size,scale=1,x=.5,y=.5):
    w,h=size;ratio=max(w/image.width,h/image.height)*scale
    # Scale only after crop, bounding intermediate memory even at 5x zoom.
    cw,ch=w/ratio,h/ratio
    left=(image.width-cw)*x;top=(image.height-ch)*y
    return image.crop((int(left),int(top),int(left+cw),int(top+ch))).resize((w,h),Image.Resampling.LANCZOS).convert('RGB')

def text_width(draw,text,f,tracking=0):return draw.textlength(text,font=f)+max(0,len(text)-1)*tracking

def draw_text(draw,xy,text,f,color,anchor='center',tracking=0,stroke=0,shadow=False):
    x,y=xy;w=text_width(draw,text,f,tracking)
    x-=w/2 if anchor=='center' else w if anchor=='right' else 0
    for char in text:
        if shadow:draw.text((x+2,y+3),char,font=f,fill='#08090b',stroke_width=stroke)
        draw.text((x,y),char,font=f,fill=color,stroke_width=stroke,stroke_fill='#111318')
        x+=draw.textlength(char,font=f)+tracking

def wrap(draw,text,f,max_width):
    lines=[];line=''
    for word in text.split():
        proposed=(line+' '+word).strip()
        if line and draw.textlength(proposed,font=f)>max_width:lines.append(line);line=word
        else:line=proposed
    if line:lines.append(line)
    return lines

def cover_image(store,project,design,size=2048):
    d=CoverDesign.model_validate(design)
    image=Image.new('RGB',(size,size),d.background)
    if d.backgroundId:
        asset,path=visual_path(store,project,d.backgroundId)
        if asset.kind=='video':raise ValueError('Choose a still image for the cover')
        with Image.open(path) as src:image=fit(ImageOps.exif_transpose(src),(size,size),d.scale,d.x,d.y)
    image=Image.blend(image,Image.new('RGB',image.size,'black'),d.overlay)
    draw=ImageDraw.Draw(image);factor=size/1024;f=font(d.font,d.size*factor)
    title=d.title or project.name;artist=d.artist or project.artist
    x={'left':size*.08,'center':size*.5,'right':size*.92}[d.align];y=size*d.textY
    lines=wrap(draw,title,f,size*.84)
    while len(lines)*(d.size*factor*1.2)>size*.4 and d.size>20:
        d.size-=2;f=font(d.font,d.size*factor);lines=wrap(draw,title,f,size*.84)
    y=min(y,size*.88-len(lines)*d.size*factor*1.15)
    for line in lines:
        draw_text(draw,(x,y),line,f,d.color,d.align,d.tracking*factor,d.stroke,d.shadow);y+=d.size*factor*1.15
    for text,fs in ((artist,d.size*.42),(d.subtitle,d.size*.28)):
        if text:
            y+=size*.018;draw_text(draw,(x,y),text,font(d.font,fs*factor),d.color,d.align,d.tracking*factor*.3,0,d.shadow);y+=fs*factor*1.2
    return image

class VideoReader:
    def __init__(self,path,size,fps,start=0):
        w,h=size
        self.bytes=w*h*3;self.size=size
        self.process=subprocess.Popen([ffmpeg(),'-nostdin','-v','error','-stream_loop','-1','-ss',str(start),'-i',str(path),'-an','-vf',f'scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps}','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    def frame(self):
        chunks=[];remaining=self.bytes
        while remaining:
            block=self.process.stdout.read(remaining)
            if not block:raise RuntimeError('Video background decode ended unexpectedly')
            chunks.append(block);remaining-=len(block)
        return Image.frombytes('RGB',self.size,b''.join(chunks))
    def close(self):
        self.process.terminate()
        try:self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:self.process.kill()

def draw_visualizer(image,samples,d:VideoDesign,state):
    if d.visualizer=='none' or not len(samples):return
    w,h=image.size;draw=ImageDraw.Draw(image);cx=w*d.visualizerX;cy=h*d.visualizerY;span=w*d.visualizerSize;amplitude=h*.12
    color=tuple(int(d.highlight[i:i+2],16) for i in (1,3,5))
    # Layer opacity is real alpha; energy is measured from the actual audio block.
    layer=Image.new('RGBA',image.size,(0,0,0,0));draw=ImageDraw.Draw(layer);ink=(*color,int(d.opacity*255))
    mono=samples.mean(axis=1) if samples.ndim>1 else samples
    rms=float(np.sqrt(np.mean(mono*mono)));energy=min(1,rms*5*d.sensitivity)
    n=128;indices=np.linspace(0,len(mono)-1,n).astype(int);wave=mono[indices]*d.sensitivity
    if d.visualizer in ('waveform','mirrored','scope'):
        points=[(cx-span/2+i*span/(n-1),cy-float(v)*amplitude*2) for i,v in enumerate(wave)]
        draw.line(points,fill=ink,width=d.thickness)
        if d.visualizer=='mirrored':draw.line([(x,2*cy-y) for x,y in points],fill=ink,width=d.thickness)
    else:
        fft=np.abs(np.fft.rfft(mono*np.hanning(len(mono)),n=4096))
        edges=np.geomspace(2,1800,49).astype(int)
        values=np.array([min(1,float(np.mean(fft[a:max(a+1,b)]))*d.sensitivity*.15) for a,b in zip(edges,edges[1:])])
        old=state.get('spectrum',values);values=old*d.smoothing+values*(1-d.smoothing);state['spectrum']=values
        for i,v in enumerate(values):
            if d.visualizer=='bars':
                x=cx-span/2+i*span/48;bar=float(v)*amplitude*2
                draw.rounded_rectangle((x,cy-bar,x+span/48*.65,cy+2),radius=2,fill=ink)
            elif d.visualizer=='circle':
                angle=i/48*math.tau;r=min(w,h)*.16;outer=r+float(v)*amplitude
                draw.line((cx+math.cos(angle)*r,cy+math.sin(angle)*r,cx+math.cos(angle)*outer,cy+math.sin(angle)*outer),fill=ink,width=d.thickness)
            elif d.visualizer=='particles':
                # Stable positions with audio-driven radius and opacity, no random motion.
                x=cx+math.cos(i*2.39996)*span*.45*(i/48)**.5;y=cy+math.sin(i*2.39996)*h*.16
                r=1+float(v)*12+energy*3;draw.ellipse((x-r,y-r,x+r,y+r),fill=ink)
    image.paste(layer,(0,0),layer)

def draw_lyrics(image,timing,t,d,enabled=True,x=.5):
    if not enabled:return
    active=[line for line in timing.lines if line.start is not None and line.start<=t<line.end]
    if not active:return
    w,h=image.size;draw=ImageDraw.Draw(image);base=d.fontSize*h/1080
    y=h*d.lyricY
    for line in active[:2]:
        f=font(d.font,base);width=w*(.72 if line.voice in ('a','b','c','d') else .84);lines=wrap(draw,line.text,f,width)
        while len(lines)>3 and base>18:
            base*=.9;f=font(d.font,base);width=w*(.72 if line.voice in ('a','b','c','d') else .84);lines=wrap(draw,line.text,f,width)
        # Word colors are based on authored/measured intervals; no evenly spaced fake words.
        token_index=0
        for text in lines:
            length=draw.textlength(text,font=f)
            center=max(width/2,min(w-width/2,w*x))
            cursor=center-width/2 if line.voice in ('a','c') else center+width/2-length if line.voice in ('b','d') else center-length/2
            for word in text.split():
                timed=line.words[token_index] if token_index<len(line.words) else None
                highlight=d.kind=='karaoke' and timed and timed.start is not None and timed.start<=t
                color=d.highlight if highlight else d.color
                draw.text((cursor+2,y+3),word,font=f,fill='#090b0e',stroke_width=3)
                draw.text((cursor,y),word,font=f,fill=color,stroke_width=1,stroke_fill='#111318')
                cursor+=draw.textlength(word+' ',font=f);token_index+=1
            y+=base*1.3
        if d.template=='classic' and len(active)==1:
            nextline=next((l for l in timing.lines if l.start is not None and l.start>=line.end),None)
            if nextline:
                nf=font(d.font,base*.65)
                for upcoming in wrap(draw,nextline.text,nf,w*.84):
                    draw_text(draw,(w*x,y+base*.3),upcoming,nf,'#abb0b8',shadow=True);y+=base*.85

def render_video(store,job,progress):
    from .schema import Project
    p=Project.model_validate(job['snapshot']);d=VideoDesign.model_validate(job['request']['options']['design']);timing=p.visuals.timing
    source=store.asset_path(d.audioAssetId);audio=store.asset(d.audioAssetId)
    duration=min(d.duration or audio['duration']-d.start,audio['duration']-d.start)
    if not 0<duration<=1200:raise ValueError('Choose an audio region of up to twenty minutes')
    if d.kind in ('lyric','karaoke') or any(s.type=='lyrics' for s in d.scenes):
        if timing.assetId!=d.audioAssetId:raise ValueError('Align or correct lyrics for this audio take before rendering')
        if not timing.lines or any(l.start is None for l in timing.lines):raise ValueError('Set start and end for every lyric line before rendering. Missing word times can remain blank.')
        if timing.needsReview:raise ValueError('Review lyric timing and mark it checked before rendering')
    w,h,fps=PRESETS[d.preset]
    if d.preview:w,h,fps=2*round(w/6),2*round(h/6),24;duration=min(duration,12)
    frames=math.ceil(duration*fps)
    dest=store.project_dir(p.id)/'visuals';extension='mkv' if d.encoder=='archive' else 'webm' if d.encoder in ('webm','av1') else 'mp4'
    target=dest/(job['id']+'.'+extension);partial=dest/(job['id']+'-partial.'+extension)
    codecs={'h264':['-c:v','libx264','-preset','fast','-crf',str(d.crf)],'hevc':['-c:v','libx265','-preset','fast','-crf',str(d.crf)],'av1':['-c:v','libsvtav1','-preset','8','-crf',str(d.crf)],'webm':['-c:v','libvpx-vp9','-crf',str(d.crf),'-b:v','0'],'archive':['-c:v','ffv1','-level','3']}
    acodec=['-c:a','flac'] if d.encoder=='archive' else ['-c:a','libopus','-b:a','256k'] if extension=='webm' else ['-c:a','aac','-b:a','320k']
    args=[ffmpeg(),'-nostdin','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r',str(fps),'-i','pipe:0','-ss',str(d.start),'-i',str(source),'-map','0:v','-map','1:a','-t',str(duration),*codecs[d.encoder],'-threads','4','-pix_fmt','bgr0' if d.encoder=='archive' else 'yuv420p',*acodec]
    if extension=='mp4':args+=['-movflags','+faststart']
    args+=[str(partial)]
    progress('Preparing assets','Preparing artwork, typography and original audio')
    readers={};spectrum={};started=time.perf_counter()
    @functools.lru_cache(maxsize=6)
    def still(asset_id):
        _,path=visual_path(store,p,asset_id)
        with Image.open(path) as src:return fit(ImageOps.exif_transpose(src),(w,h))
    log=open(dest/(job['id']+'-encoder.log'),'wb');process=subprocess.Popen(args,stdin=subprocess.PIPE,stderr=log)
    def background(asset_id,key,t,motion='still'):
        asset,path=visual_path(store,p,asset_id)
        if asset.kind=='video':
            if key not in readers:readers[key]=VideoReader(path,(w,h),fps,max(0,t))
            return readers[key].frame()
        base=still(asset_id)
        if motion=='still':return base.copy()
        phase=min(1,max(0,t/max(1,duration)))
        return fit(base,(w,h),1.02+.06*phase if motion=='zoom' else 1.08,.2+.6*phase if motion=='pan' else .5,.5)
    try:
        with sf.SoundFile(source) as sound:
            for index in range(frames):
                if index%fps==0:
                    if store.job(job['id'])['state']=='Cancelled':raise InterruptedError('Video rendering cancelled')
                    progress('Rendering frames',f'Frame {index+1:,} / {frames:,}',progress=(index+1)/frames,unitsDone=index+1,unitsTotal=frames,unit='frames',progressLabel='Video frames')
                t=d.start+index/fps;local=index/fps
                image=Image.new('RGB',(w,h),d.background)
                if d.backgroundId:image=background(d.backgroundId,'main',t,d.motion)
                for scene in d.scenes:
                    if not scene.start<=t<scene.end:continue
                    layer=None
                    if scene.type in ('image','video') and scene.assetId:layer=background(scene.assetId,scene.id,t-scene.start,scene.motion)
                    elif scene.type=='color':layer=Image.new('RGB',(w,h),scene.color)
                    if layer is not None:
                        if scene.type in ('image','video'):
                            scaled=layer.resize((max(1,int(w*scene.size)),max(1,int(h*scene.size))),Image.Resampling.LANCZOS)
                            placed=image.copy();placed.paste(scaled,(int(w*scene.x-scaled.width/2),int(h*scene.y-scaled.height/2)));layer=placed
                        alpha=scene.opacity*min(1,(t-scene.start)/max(.001,scene.fade),(scene.end-t)/max(.001,scene.fade))
                        image=Image.blend(image,layer,max(0,min(1,alpha)))
                image=Image.blend(image,Image.new('RGB',(w,h),'black'),.22 if d.template!='minimal' else .65)
                begin=min(len(sound),int(t*sound.samplerate));sound.seek(begin);samples=sound.read(4096,dtype='float32',always_2d=True)
                if d.beatPulse and len(samples):
                    energy=min(.025,float(np.sqrt(np.mean(samples*samples)))*.12)
                    image=fit(image,(w,h),1+energy)
                draw_visualizer(image,samples,d,spectrum)
                lyric_scenes=[scene for scene in d.scenes if scene.type=='lyrics']
                draw_lyrics(image,timing,t,d,d.kind!='visualizer' and not lyric_scenes)
                for scene in d.scenes:
                    if not scene.start<=t<scene.end:continue
                    if scene.type in ('waveform','spectrum'):
                        alpha=scene.opacity*min(1,(t-scene.start)/max(.001,scene.fade),(scene.end-t)/max(.001,scene.fade))
                        settings=d.model_copy(update={'visualizer':'waveform' if scene.type=='waveform' else 'bars','visualizerX':scene.x,'visualizerY':scene.y,'visualizerSize':scene.size,'opacity':max(0,alpha),'highlight':scene.color})
                        draw_visualizer(image,samples,settings,spectrum.setdefault(scene.id,{}))
                    elif scene.type=='lyrics':
                        settings=d.model_copy(update={'lyricY':scene.y,'fontSize':max(20,int(d.fontSize*scene.size)),'color':scene.color})
                        overlay=image.copy();draw_lyrics(overlay,timing,t,settings,x=scene.x)
                        alpha=scene.opacity*min(1,(t-scene.start)/max(.001,scene.fade),(scene.end-t)/max(.001,scene.fade))
                        image=Image.blend(image,overlay,max(0,min(1,alpha)))
                draw=ImageDraw.Draw(image)
                if d.intro and local<4:
                    draw_text(draw,(w*.06,h*.07),p.name,font(d.font,h*.045),d.color,'left',shadow=True)
                    if p.artist:draw_text(draw,(w*.06,h*.13),p.artist,font(d.font,h*.025),'#ced0d5','left',shadow=True)
                for scene in d.scenes:
                    if scene.type in ('text','title') and scene.start<=t<scene.end:
                        overlay=Image.new('RGB',(w,h));overlay.paste(image)
                        draw_text(ImageDraw.Draw(overlay),(w*scene.x,h*scene.y),scene.text,font(d.font,h*.07*scene.size),scene.color,shadow=True)
                        alpha=scene.opacity*min(1,(t-scene.start)/max(.001,scene.fade),(scene.end-t)/max(.001,scene.fade))
                        image=Image.blend(image,overlay,max(0,min(1,alpha)))
                process.stdin.write(image.tobytes())
        progress('Encoding','Finalizing video and high-quality audio')
        process.stdin.close();code=process.wait(timeout=300)
        if code:raise RuntimeError('Video encoder failed; see the retained encoder log')
        partial.replace(target)
    finally:
        for reader in readers.values():reader.close()
        if process.poll() is None:process.terminate()
        log.close();still.cache_clear()
    progress('Finalizing','Saving video in this project')
    asset=VisualAsset(id=job['id'],name=f'{p.name} · {d.kind.title()}',kind='video',path='visuals/'+target.name,width=w,height=h,duration=duration,createdAt=time.time(),model='Pillow + FFmpeg',jobId=job['id'],sourceAssetId=d.audioAssetId,parentId=d.backgroundId,settings={'design':d.model_dump(),'timing':timing.model_dump(),'projectRevision':p.revision,'fps':fps,'renderSeconds':time.perf_counter()-started})
    store.mutate(p.id,lambda project:project.visuals.assets.append(asset) if not any(a.id==asset.id for a in project.visuals.assets) else None,'New video render')
    return {'visualAssetId':asset.id,'duration':duration,'width':w,'height':h,'fps':fps,'seconds':time.perf_counter()-started}

def main():
    import sys
    from .storage import Store
    from .schema import Project
    task=json.loads(sys.stdin.readline());store=Store(Path(task['root']));job=task['job']
    def progress(state,message,**extra):print(json.dumps({'state':state,'message':message,**extra}),flush=True)
    if job['kind']=='video':result=render_video(store,job,progress)
    elif job['kind']=='cover':
        p=Project.model_validate(job['snapshot']);design=job['request']['options']['design'];progress('Rendering frames','Designing the cover')
        path=store.project_dir(p.id)/'visuals'/(job['id']+'-cover.png');cover_image(store,p,design).save(path)
        a=VisualAsset(id=job['id'],name=p.name+' · cover',kind='cover',path='visuals/'+path.name,width=2048,height=2048,createdAt=time.time(),model='Cover designer',jobId=job['id'],parentId=design.get('backgroundId'),settings=design)
        store.mutate(p.id,lambda project:project.visuals.assets.append(a) if not any(x.id==a.id for x in project.visuals.assets) else None,'New cover design');result={'visualAssetId':a.id}
    elif job['kind']=='master':
        from .render import encode
        from .audio import ingest
        source=store.asset_path(job['request']['assetId']);options=job['request']['options'];path=store.project_dir(job['projectId'])/'renders'/(job['id']+'-master.'+options.get('format','wav'))
        progress('Encoding','Mastering a separate copy');encode(source,path,{**options,'master':True})
        a=ingest(store,job['projectId'],path,'Master · '+store.asset(job['request']['assetId'])['name'],'master',{'sourceAssetIds':[job['request']['assetId']],'jobId':job['id'],'settings':options});result={'assetId':a['id'],'parentAssetId':job['request']['assetId']}
    else:
        from .render import render_job
        render_job(store,job);result={}
    print(json.dumps({'done':True,'result':result}),flush=True)

if __name__=='__main__':
    try:main()
    except Exception as exc:
        import sys,traceback
        traceback.print_exc(file=sys.stderr);print(json.dumps({'error':str(exc)[:1000]}),flush=True);sys.exit(1)
