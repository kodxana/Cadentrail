"""Short-lived auxiliary GPU models. The owning queue unloads YuE2 first."""
import contextlib, json, os, re, sys, time
from pathlib import Path
from .schema import uid
from .visual_schema import VisualAsset

def emit(**data): print(json.dumps(data),file=sys.__stdout__,flush=True)

class SDXLProvider:
    def generate(self, request, destination, progress):
        import torch
        from diffusers import StableDiffusionXLPipeline
        model=os.getenv('DAW_ARTWORK_MODEL','stabilityai/stable-diffusion-xl-base-1.0')
        progress('Preparing assets','Loading artwork model from persistent cache')
        pipe=StableDiffusionXLPipeline.from_pretrained(request['_modelPath'],local_files_only=True,torch_dtype=torch.float16,variant='fp16',use_safetensors=True,add_watermarker=False).to('cuda')
        pipe.enable_vae_tiling()
        width,height={'1:1':(1024,1024),'16:9':(1344,768),'9:16':(768,1344),'4:5':(896,1120)}[request['aspect']]
        for index in range(request['count']):
            seed=request['seed']+index
            progress('Generating',f'Creating artwork {index+1} of {request["count"]}')
            def step_callback(pipeline,step,timestep,values):
                progress('Generating',f'Artwork {index+1} of {request["count"]}',progress=(step+1)/request['steps'],progressLabel='Image synthesis',unitsDone=step+1,unitsTotal=request['steps'],unit='steps')
                return values
            image=pipe(prompt=request['prompt'],negative_prompt=request.get('negativePrompt','text, letters, watermark, signature, blurry'),width=width,height=height,num_inference_steps=request.get('steps',30),guidance_scale=7,generator=torch.Generator(device='cuda').manual_seed(seed),callback_on_step_end=step_callback).images[0]
            name=f'{uid()}.png';image.save(destination/name)
            yield {'name':name,'width':width,'height':height,'seed':seed,'model':model,'index':index}

class QwenProvider:
    def generate(self, request, progress):
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from .providers import text_model
        model_name=text_model(request.get('model'))
        progress('Preparing',f'Using resident {model_name}' if hasattr(self,'_loaded') else f'Loading {model_name} from persistent cache')
        if not hasattr(self, '_loaded'):
            self._loaded=(AutoTokenizer.from_pretrained(request['_modelPath'],local_files_only=True), AutoModelForCausalLM.from_pretrained(request['_modelPath'],local_files_only=True,torch_dtype=torch.bfloat16,device_map='cuda'))
        tokenizer,model=self._loaded
        operation=request.get('operation','generate')
        instructions={
            'radio':'Write a completely original song for this radio station. Follow its genre, mood, language and vocals. Use exactly this plain-text format: TITLE: your unique song title, then a newline and STYLE: a concise one-line musical arrangement description, then a newline and LYRICS: followed by the complete lyrics on separate lines with [Verse], [Chorus], [Outro] headings. No JSON, no markdown fences, no commentary. Avoid recycling titles or lyrics from the recent songs.',
            'generate':'Write an original song lyric. Use plain readable lines with optional [Verse], [Chorus], [Bridge] headings. Return only the lyrics.',
            'rewrite':'Rewrite the supplied lyrics according to the direction, retaining the language and main story. Return only the revised lyrics.',
            'continue':'Write additional original sections continuing the supplied lyrics. Return only the new sections, without repeating the existing lyrics.',
            'enhance':'Refine the supplied musical description into a clear, vivid music generation prompt. Keep the intended style and voice. Do not add irrelevant genres or invent personal details. Return only the enhanced prompt, fewer than 120 words.',
            'arrange':'Suggest an ordered instrumental song structure matching the music and direction. Return only 3 to 12 section tags, one per line. Allowed tags: [intro], [verse], [pre-chorus], [chorus], [bridge], [instrumental], [outro]. Tags may repeat. No lyrics, prose, timings or markdown fences.',
            'rhyme':'Suggest concise original rhyming alternatives for the supplied lyric lines. Return only the suggestions.',
        }
        instrumental=request.get('instrumental',False)
        if instrumental and operation=='enhance':
            instructions[operation]+=' This is instrumental music. Describe instruments and arrangement only; no vocals, singing, choir or lyrics.'
        context=(f"Existing instrumental sections:\n{request.get('sections','')}" if instrumental or operation=='arrange' else f"Existing lyrics:\n{request.get('lyrics','')}")
        prompt=f"Song title: {request.get('title','')}\nMusic: {request.get('style','')}\nDirection: {request.get('direction','')}\n{context}"
        messages=[{'role':'system','content':instructions[operation]+(' '+request.get('_lyricLanguage','') if operation in ('radio','generate','rewrite','continue','rhyme') else '')},{'role':'user','content':prompt}]
        text=tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=True,enable_thinking=False)
        inputs=tokenizer(text,return_tensors='pt',truncation=True,max_length=8192).to(model.device)
        progress('Generating','Writing a suggestion for you to review')
        torch.manual_seed(request.get('seed',831001))
        from transformers import StoppingCriteria,StoppingCriteriaList
        class ObserveTokens(StoppingCriteria):
            last=0
            def __call__(self,input_ids,scores,**kwargs):
                now=time.monotonic()
                if now-self.last>.4:
                    progress('Generating','Writing a draft for your review',unitsDone=input_ids.shape[-1]-inputs.input_ids.shape[-1],unitsTotal=None,unit='tokens',progress=None,progressLabel='Writing')
                    self.last=now
                return False
        output=model.generate(**inputs,max_new_tokens=(2200 if operation=='radio' and request.get('_longRadio') else 1400) if operation not in ('enhance','arrange') else 250,do_sample=True,temperature=.8,top_p=.95,top_k=20,repetition_penalty=1.05,stopping_criteria=StoppingCriteriaList([ObserveTokens()]))
        generated=tokenizer.decode(output[0][inputs.input_ids.shape[1]:],skip_special_tokens=True)
        generated=re.sub(r'<think>.*?</think>','',generated,flags=re.S).strip()
        if operation=='arrange':
            from .music_adapters import instrumental_sections
            if not re.search(r'\[\s*(intro|verse|pre-chorus|chorus|bridge|outro|instrumental)\s*\]',generated,re.I):
                raise ValueError('The assistant did not return a usable arrangement. Try another draft or add sections manually.')
            generated=instrumental_sections(generated)
        return {'text':generated,'model':model_name,'operation':operation,'seed':request.get('seed',831001)}

def main():
    task=json.loads(sys.stdin.readline());root=Path(task['root']);job=task['job'];kind=job['kind'];request=job['request']['options']
    os.environ['HF_HOME']=str(root/'models'/'huggingface')
    from .download_progress import install_download_progress
    install_download_progress(emit)
    from .storage import Store
    store=Store(root);project=store.load(job['projectId'])
    dest=store.project_dir(project.id)/'visuals';start=time.perf_counter()
    def progress(state,message,**details):emit(state=state,message=message,**details)
    with contextlib.redirect_stdout(sys.stderr):
        import torch
    if not torch.cuda.is_available():raise RuntimeError('This auxiliary operation requires the Runpod GPU')
    from .model_runtime import prepare_models, model_path, required_models
    from .schema import JobRequest
    model_request=JobRequest.model_validate(job['request'])
    prepare_models(root,project,model_request,emit)
    request={**request,'_modelPath':str(model_path(root,required_models(root,project,model_request)[0]))}
    torch.cuda.reset_peak_memory_stats()
    # Library progress is stderr; stage/result messages remain JSON stdout.
    if kind=='artwork':
        from .providers import artwork_provider
        with contextlib.redirect_stdout(sys.stderr):
            for a in artwork_provider().generate(request,dest,progress):
                asset=VisualAsset(name=f'Artwork {len(store.load(project.id).visuals.assets)+1}',path='visuals/'+a['name'],width=a['width'],height=a['height'],createdAt=time.time(),prompt=request['prompt'],negativePrompt=request.get('negativePrompt',''),model=a['model'],seed=a['seed'],jobId=job['id'],sourceAssetId=job['request'].get('assetId'),candidateId=request.get('candidateId'),parentId=request.get('parentId'),settings={'aspect':request['aspect'],'steps':request['steps'],'index':a['index']})
                store.mutate(project.id,lambda p:p.visuals.assets.append(asset),'New artwork')
                emit(state='Saving',message='Artwork saved',visualAssetId=asset.id)
    elif kind=='lyrics':
        from .providers import text_provider
        with contextlib.redirect_stdout(sys.stderr):
            from .song_assistance import generate_draft
            result=generate_draft(text_provider(),request,progress)
        draft={'id':uid(),'createdAt':time.time(),'jobId':job['id'],**result}
        def add(p):p.creative.lyricDrafts=(p.creative.lyricDrafts+[draft])[-100:]
        store.mutate(project.id,add,'Song assistant suggestion')
        emit(result=draft)
    elif kind=='align':
        progress('Preparing','Loading lyric alignment model')
        with contextlib.redirect_stdout(sys.stderr):
            from faster_whisper import WhisperModel
            model=WhisperModel(request['_modelPath'],device='cuda',compute_type='float16',local_files_only=True)
        progress('Aligning lyrics','Listening and matching confident words to your lyrics')
        source=store.asset_path(job['request']['assetId'])
        with contextlib.redirect_stdout(sys.stderr):
            segments,info=model.transcribe(str(source),beam_size=5,word_timestamps=True,language=None if request.get('language','auto')=='auto' else request['language'],vad_filter=False,condition_on_previous_text=False)
            words=[{'text':w.word,'start':w.start,'end':w.end,'probability':w.probability} for s in segments for w in (s.words or [])]
        from .alignment import match_lyrics
        timing=match_lyrics(request['lyrics'],words,job['request']['assetId'],info.language);timing.jobId=job['id']
        def add(p):
            if p.visuals.timing.lines:p.visuals.timingHistory=(p.visuals.timingHistory+[p.visuals.timing.model_copy(deep=True)])[-50:]
            # An edit made while alignment ran wins. Store the suggestion in history.
            if p.visuals.timing.model_dump()!=job.get('timingBefore',p.visuals.timing.model_dump()):
                p.visuals.timingHistory=(p.visuals.timingHistory+[timing])[-50:]
            else:p.visuals.timing=timing
        store.mutate(project.id,add,'Aligned lyric timing')
        (dest/(job['id']+'-alignment.json')).write_text(json.dumps({'recognized':words,'timing':timing.model_dump()},indent=2))
        emit(result={'coverage':timing.coverage,'language':info.language,'lines':len(timing.lines),'needsReview':True})
    emit(done=True,seconds=time.perf_counter()-start,metrics={'gpu':torch.cuda.get_device_name(),'peakAllocatedGiB':torch.cuda.max_memory_allocated()/2**30})

if __name__=='__main__':
    try:main()
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr);emit(error=str(e)[:1000]);sys.exit(1)
