"""Optional, isolated real-recording encoder and NAR reconstruction.

Architecture and overlap inference follow Mothersuperior's pinned v4 release.
Never merges adapter weights into the resident song-generation process.
"""
import contextlib, gc, json, math, sys, time
from pathlib import Path
import numpy as np
import soundfile as sf
from .schema import AudioEncoding

REPO='Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4'
REVISION='f2278a2e005dc4ecc421c53a0929f62b3aeb2280'
MERT='m-a-p/MERT-v2-FullSong'
MERT_REVISION='d8ba1c745e733b3908ce6ad16ebeb17ac7600a42'

def emit(**event):print(json.dumps(event),file=sys.__stdout__,flush=True)

def run(store,job):
    from .download_progress import install_download_progress
    install_download_progress(emit)
    import torch
    from torch import nn
    from transformers import AutoModel
    from .model_runtime import prepare_models, model_path, core_options
    from .schema import JobRequest
    from scipy.signal import resample_poly
    if not torch.cuda.is_available():raise ValueError('Real-audio encoding requires the GPU workstation')
    options=job['request']['options'];p=store.load(job['projectId']);source_id=job['request']['assetId']
    prepare_models(store.root,p,JobRequest.model_validate(job['request']),emit)
    source=store.asset_path(source_id);dest=store.project_dir(p.id)/'generation'/job['id'];dest.mkdir(parents=True,exist_ok=True)
    started=time.perf_counter();torch.cuda.reset_peak_memory_stats()
    with sf.SoundFile(source) as sound:
        sound.seek(min(len(sound),round(options['start']*sound.samplerate)))
        audio=sound.read(round(options['duration']*sound.samplerate),dtype='float32',always_2d=True);rate=sound.samplerate
    if len(audio)<rate:raise ValueError('Choose a source region containing at least one second')
    factor=math.gcd(rate,24000);mono=resample_poly(audio.mean(1),24000//factor,rate//factor).astype(np.float32)
    emit(state='Preparing assets',message='Loading the pinned MERT encoder and v4 tokenizer')
    head_path=model_path(store.root,'realaudio-v4')/'tokenizer_head_joint_v4.pt'
    # The two model source files at this exact revision were inspected. No floating remote code revision.
    mert=AutoModel.from_pretrained(str(model_path(store.root,'mert')),local_files_only=True,trust_remote_code=True,attn_implementation='sdpa').to('cuda').eval()
    features=[]
    emit(state='Analyzing',message='Encoding the actual recording at 25 frames per second')
    with torch.inference_mode(),torch.autocast('cuda',dtype=torch.bfloat16):
        for start in range(0,len(mono),720000):
            chunk=mono[start:start+720000]
            # Pad only the last sub-second tail, then retain its measured frame count.
            valid=max(1,round(len(chunk)/24000*25))
            if len(chunk)<24000:chunk=np.pad(chunk,(0,24000-len(chunk)))
            output=mert(input_values=torch.from_numpy(chunk[None]).to('cuda'),output_hidden_states=True)
            features.append(output.hidden_states[20][0,:valid].float().cpu())
            del output
    del mert;gc.collect();torch.cuda.empty_cache()
    x=torch.cat(features).numpy();target=round(len(mono)/24000*25)
    x=torch.nn.functional.interpolate(torch.from_numpy(x).T[None],size=target,mode='linear',align_corners=False)[0].T.numpy()
    x=(x-x.mean(0))/(x.std(0)+1e-5)
    class Head(nn.Module):
        def __init__(self):
            super().__init__();self.inp=nn.Linear(1024,512);self.pos=nn.Parameter(torch.zeros(1,512,512))
            layer=nn.TransformerEncoderLayer(512,8,2048,dropout=.1,batch_first=True,norm_first=True,activation='gelu')
            self.enc=nn.TransformerEncoder(layer,8);self.norm=nn.LayerNorm(512);self.head=nn.Linear(512,32768)
        def forward(self,value):return self.head(self.norm(self.enc(self.inp(value)+self.pos[:,:value.shape[1]])))
    head=Head().to('cuda').eval();checkpoint=torch.load(head_path,map_location='cpu',weights_only=True)
    head.load_state_dict(checkpoint['model'],strict=True);del checkpoint
    length=len(x);tokens=np.zeros(length,dtype=np.int32);starts=list(range(0,max(1,length-512+1),256))
    if starts[-1]+512<length:starts.append(max(0,length-512))
    with torch.inference_mode(),torch.autocast('cuda',dtype=torch.bfloat16):
        for start in starts:
            chunk=x[start:start+512];n=len(chunk)
            if n<512:chunk=np.pad(chunk,((0,512-n),(0,0)))
            predictions=head(torch.from_numpy(chunk[None]).to('cuda'))[0,:n].argmax(-1).cpu().numpy()
            lo=start+(0 if start==0 else 128);hi=start+n-(0 if start+n>=length else 128)
            tokens[lo:hi]=predictions[lo-start:hi-start]
    del head;gc.collect();torch.cuda.empty_cache();np.save(dest/'semantic.npy',tokens)
    result_id=None
    if options['reconstruct']:
        from yue2 import YuE2Pipeline
        from yue2.pipeline import SemanticResult
        from dataclasses import replace
        from .audio import ingest
        emit(state='Rendering',message='Reconstructing a separate audio copy with the real-audio NAR adapter')
        path=model_path(store.root,'realaudio-v4')/'nar_lora_joint_v4.pt'
        adapter=torch.load(path,map_location='cpu',weights_only=True)
        pipe=YuE2Pipeline.from_pretrained(**core_options(store.root),device='cuda',quantization='none',backend='torch',progress=True)
        model=pipe._load_model();layers=model.model.layers
        if len(adapter['lora'])!=len(layers)*14:raise ValueError('The NAR adapter does not match this YuE2 architecture')
        tensors=iter(adapter['lora'])
        with torch.no_grad():
            for layer in layers:
                for module,names in ((layer.nar_self_attn,('q_proj','k_proj','v_proj','o_proj')),(layer.nar_mlp,('gate_proj','up_proj','down_proj'))):
                    for name in names:
                        a,b=next(tensors),next(tensors);weight=getattr(module,name).weight
                        if a.ndim!=2 or b.ndim!=2 or (b.shape[0],a.shape[1])!=weight.shape or b.shape[1]!=a.shape[0]:raise ValueError('Incompatible adapter tensor shapes')
                        weight.add_((b.to('cuda').float()@a.to('cuda').float()).to(weight.dtype))
            model.vae2llm.load_state_dict(adapter['io']['vae2llm'],strict=True)
            model.llm2vae.load_state_dict(adapter['io']['llm2vae'],strict=True)
        del adapter
        pipe.generation_config=replace(pipe.generation_config,ode_steps=options['odeSteps'])
        plan=pipe.plan(style=p.generation.style,lyrics=p.generation.lyrics,cot='off',seed=options['seed'])
        semantic=SemanticResult(plan,tokens.tolist(),{'source':'real-audio-tokenizer-v4'},False);latents=pipe.synthesize(semantic);rendered=pipe.decode(latents)
        sf.write(dest/'reconstruction.flac',rendered,48000,subtype='PCM_24');pipe.close()
        asset=ingest(store,p.id,dest/'reconstruction.flac','Real-audio reconstruction · '+store.asset(source_id)['name'],'realaudio',{'sourceAssetIds':[source_id],'jobId':job['id'],'model':REPO,'revision':REVISION})
        result_id=asset['id']
    record=AudioEncoding(id=job['id'],name=store.asset(source_id)['name'],sourceAssetId=source_id,resultAssetId=result_id,model=REPO,revision=REVISION,mertRevision=MERT_REVISION,createdAt=time.time(),start=options['start'],duration=len(audio)/rate,tokens=len(tokens),settings=options)
    store.mutate(p.id,lambda p:p.audioEncodings.append(record) if not any(e.id==record.id for e in p.audioEncodings) else None,'Real-audio encoding')
    (dest/'encoding.json').write_text(record.model_dump_json(indent=2))
    return {'encodingId':job['id'],'assetId':result_id,'tokens':len(tokens),'duration':len(audio)/rate,'seconds':time.perf_counter()-started,'peakAllocatedGiB':torch.cuda.max_memory_allocated()/2**30}

if __name__=='__main__':
    try:
        from .storage import Store
        task=json.loads(sys.stdin.readline())
        with contextlib.redirect_stdout(sys.stderr):result=run(Store(Path(task['root'])),task['job'])
        emit(done=True,result=result)
    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr);emit(error=str(exc)[:1000]);sys.exit(1)
