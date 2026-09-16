"""Demucs auxiliary worker with explicit float WAV I/O.

Avoids torchaudio's version-dependent codec backend. No YuE2 dependencies are
changed to accommodate source separation. Float stems preserve headroom.
"""
import argparse,json,os,sys
from pathlib import Path
import soundfile as sf
import torch
from demucs.pretrained import get_model
from demucs.apply import apply_model
from demucs.audio import convert_audio

def progress(state,message):
    print('CADENTRAIL_PROGRESS '+json.dumps({'state':state,'message':message}),file=sys.stderr,flush=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('output');args=parser.parse_args()
    if os.getenv('DAW_MODEL_ROOT'):
        from .model_runtime import prepare_models, model_path
        from .schema import JobRequest
        prepare_models(Path(os.environ['DAW_MODEL_ROOT']),None,JobRequest.model_validate_json(os.environ['DAW_JOB_REQUEST']),lambda **event:print('CADENTRAIL_PROGRESS '+json.dumps(event),file=sys.stderr,flush=True))
    progress('Preparing assets','Loading stem separation model')
    torch.manual_seed(0)
    if os.getenv('DAW_MODEL_ROOT'):
        from demucs.states import load_model
        checkpoint=model_path(Path(os.environ['DAW_MODEL_ROOT']),'demucs')
        model=load_model(torch.load(checkpoint,map_location='cpu',weights_only=False)).eval()
    else:
        model=get_model('htdemucs').eval()
    audio,sr=sf.read(args.source,always_2d=True,dtype='float32')
    wav=convert_audio(torch.from_numpy(audio.T.copy()),sr,model.samplerate,model.audio_channels)
    ref=wav.mean(0);mean=ref.mean();std=ref.std().clamp_min(1e-8)
    device='cuda' if torch.cuda.is_available() else 'cpu'
    model.to(device)
    progress('Generating','Separating vocals, drums, bass and other with Demucs')
    with torch.inference_mode():
        sources=apply_model(model,((wav-mean)/std)[None],device=device,shifts=1,split=True,overlap=.25,progress=True)[0]
    sources=sources*std+mean
    progress('Saving','Writing separated audio stems')
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    for name,values in zip(model.sources,sources):
        sf.write(output/(name+'.wav'),values.cpu().numpy().T,model.samplerate,subtype='FLOAT')

if __name__=='__main__':main()
