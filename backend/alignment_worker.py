"""Isolated optional GPU alignment runtime. Main YuE2 dependencies stay untouched."""
import contextlib,gc,json,os,sys,time
from pathlib import Path

def emit(**data):print(json.dumps(data),file=sys.__stdout__,flush=True)
def progress(state,message,**details):emit(state=state,message=message,progress=None,unitsDone=None,unitsTotal=None,progressLabel=None,**details)
LANGUAGES={'en':'English','zh':'Chinese','yue':'Cantonese','fr':'French','de':'German','it':'Italian','ja':'Japanese','ko':'Korean','pt':'Portuguese','ru':'Russian','es':'Spanish'}

def main():
    task=json.loads(sys.stdin.readline());root=Path(task['root']);job=task['job'];options=job['request']['options'];start=time.perf_counter()
    os.environ.update(HF_HOME=str(root/'models'/'huggingface'),TOKENIZERS_PARALLELISM='false',HF_HUB_DISABLE_TELEMETRY='1')
    from .storage import Store
    from .schema import JobRequest
    from .model_runtime import prepare_models,model_path
    store=Store(root);project=store.load(job['projectId']);asset_id=job['request']['assetId'];source=store.asset_path(asset_id)
    # Consent is enforced before downloading; inference uses only the resulting local paths.
    os.environ.pop('HF_HUB_OFFLINE',None)
    os.environ.pop('TRANSFORMERS_OFFLINE',None)
    prepare_models(root,project,JobRequest.model_validate(job['request']),emit)
    os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
    dest=store.project_dir(project.id)/'visuals';dest.mkdir(exist_ok=True)
    with contextlib.redirect_stdout(sys.stderr):
        import torch,numpy as np,soundfile as sf
        from scipy.signal import resample_poly
    if not torch.cuda.is_available():raise RuntimeError('Use the Runpod GPU for song alignment')
    torch.set_num_threads(4);torch.cuda.reset_peak_memory_stats()
    wav,sr=sf.read(source,dtype='float32',always_2d=True)
    if options.get('isolateVocals',False):
        progress('Preparing assets','Isolating vocals for lyric and voice analysis')
        with contextlib.redirect_stdout(sys.stderr):
            from demucs.apply import apply_model
            from demucs.audio import convert_audio
            # Use the exact approved checkpoint. Do not let Demucs fetch another copy.
            checkpoint=model_path(root,'demucs')
            from demucs.states import load_model
            # Demucs packages contain its model class; this is our pinned, checksum-verified checkpoint.
            package=torch.load(checkpoint,map_location='cpu',weights_only=False)
            demucs=load_model(package).eval().to('cuda')
            del package
            audio=convert_audio(torch.from_numpy(wav.T.copy()),sr,demucs.samplerate,demucs.audio_channels)
            ref=audio.mean(0);mean=ref.mean();std=ref.std().clamp_min(1e-8)
            with torch.inference_mode():separated=apply_model(demucs,((audio-mean)/std)[None],device='cuda',shifts=1,split=True,overlap=.25,progress=True)[0]
            vocals=separated[demucs.sources.index('vocals')]*std+mean
            wav=vocals.detach().cpu().T.numpy();sr=demucs.samplerate
            del demucs,separated,vocals,audio,ref
        gc.collect();torch.cuda.empty_cache()
    mono=wav.mean(axis=1)
    if sr!=16000:
        from math import gcd
        factor=gcd(sr,16000);mono=resample_poly(mono,16000//factor,sr//factor).astype('float32')
    duration=len(mono)/16000
    if options.get('detectVoices',True) and duration>600:raise ValueError('Automatic voice detection supports up to ten minutes per take. Disable voice detection for a longer recording.')
    progress('Aligning lyrics','Recognizing the song and measuring word boundaries')
    with contextlib.redirect_stdout(sys.stderr):
        from qwen_asr import Qwen3ASRModel
        model=Qwen3ASRModel.from_pretrained(str(model_path(root,'qwen-asr')),dtype=torch.bfloat16,device_map='cuda:0',max_inference_batch_size=1,max_new_tokens=4096,forced_aligner=str(model_path(root,'qwen-aligner')),forced_aligner_kwargs={'dtype':torch.bfloat16,'device_map':'cuda:0'})
        result=model.transcribe(audio=(mono,16000),language=None if options.get('language','auto')=='auto' else LANGUAGES[options['language']],return_time_stamps=True)[0]
    words=[{'text':w.text,'start':float(w.start_time),'end':float(w.end_time)} for w in (result.time_stamps or []) if 0<=w.start_time<=w.end_time<=duration+.05]
    from .alignment import match_lyrics
    language=next((code for code,name in LANGUAGES.items() if name==result.language),'auto')
    timing=match_lyrics(options['lyrics'],words,asset_id,language,forced=True);timing.jobId=job['id']
    transcript=result.text
    del model;gc.collect();torch.cuda.empty_cache()
    fallback_words=[]
    if (timing.coverage or 0)<.98:
        progress('Aligning lyrics','Cross-checking missing lyrics with Whisper large-v3')
        with contextlib.redirect_stdout(sys.stderr):
            from faster_whisper import WhisperModel
            whisper=WhisperModel(str(model_path(root,'whisper')),device='cuda',compute_type='float16',local_files_only=True)
            heard,info=whisper.transcribe(mono if options.get('isolateVocals',False) else str(source),language=None if language=='auto' else 'zh' if language=='yue' else language,word_timestamps=True,vad_filter=False,beam_size=5,condition_on_previous_text=False)
            fallback_words=[{'text':w.word.strip(),'start':w.start,'end':w.end,'probability':w.probability} for segment in heard for w in (segment.words or [])]
            del whisper
        from .alignment import combine_alignments
        timing=combine_alignments(timing,match_lyrics(options['lyrics'],fallback_words,asset_id,language));timing.jobId=job['id']
        gc.collect();torch.cuda.empty_cache()
    segments=[]
    if options.get('detectVoices',True):
        progress('Detecting voices','Measuring voice activity and overlapping vocals')
        temporary=dest/(job['id']+'-voice-analysis.wav')
        sf.write(temporary,mono,16000,subtype='PCM_16')
        try:
            with contextlib.redirect_stdout(sys.stderr):
                from nemo.collections.asr.models import SortformerEncLabelModel
                detector=SortformerEncLabelModel.restore_from(str(model_path(root,'sortformer')/'diar_streaming_sortformer_4spk-v2.1.nemo'),map_location='cuda',strict=True).eval()
                detector.sortformer_modules.chunk_len=340
                detector.sortformer_modules.chunk_right_context=40
                detector.sortformer_modules.fifo_len=40
                detector.sortformer_modules.spkcache_update_period=300
                _,probabilities=detector.diarize(audio=str(temporary),batch_size=1,include_tensor_outputs=True)
                frame_step=float(detector.cfg.preprocessor.window_stride)*int(detector.cfg.encoder.subsampling_factor)
                from .voices import probability_segments,assign_voices
                segments=probability_segments(probabilities[0].detach().cpu().numpy(),duration,frame_step)
                assign_voices(timing,segments,options.get('maxVoices',2))
                del detector,probabilities
        finally:temporary.unlink(missing_ok=True)
        gc.collect();torch.cuda.empty_cache()
    progress('Finalizing','Saving timing and voice suggestions without replacing manual edits')
    def add(p):
        current=p.visuals.timing
        if current.lines:p.visuals.timingHistory=(p.visuals.timingHistory+[current.model_copy(deep=True)])[-50:]
        if current.model_dump()!=job.get('timingBefore',current.model_dump()):p.visuals.timingHistory=(p.visuals.timingHistory+[timing])[-50:]
        else:p.visuals.timing=timing
    store.mutate(project.id,add,'Aligned song lyrics and voice suggestions')
    (dest/(job['id']+'-alignment.json')).write_text(json.dumps({'recognized':words,'transcript':transcript,'fallbackRecognized':fallback_words,'speakerSegments':segments,'settings':options,'timing':timing.model_dump()},indent=2),encoding='utf-8')
    emit(done=True,state='Complete',progress=1,seconds=time.perf_counter()-start,result={'coverage':timing.coverage,'language':language,'lines':len(timing.lines),'voices':len(timing.voices),'assignedLines':sum(bool(l.voice) for l in timing.lines),'needsReview':True},metrics={'gpu':torch.cuda.get_device_name(),'peakAllocatedGiB':torch.cuda.max_memory_allocated()/2**30})

if __name__=='__main__':
    try:main()
    except Exception as error:
        import traceback
        traceback.print_exc(file=sys.stderr);emit(error=str(error)[:1000]);sys.exit(1)
