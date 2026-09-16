"""Optional capabilities. Configuration belongs on the server, never in projects."""
import importlib.util, os
from typing import Protocol, Iterable

TEXT_MODELS = (
    {'id':'Qwen/Qwen3-1.7B','name':'Qwen3 · 1.7B','description':'Quick drafts · smallest download','downloadGiB':3.8},
    {'id':'Qwen/Qwen3-4B','name':'Qwen3 · 4B','description':'Balanced · recommended','downloadGiB':7.5},
    {'id':'Qwen/Qwen3-8B','name':'Qwen3 · 8B','description':'Larger writer · more memory and loading time','downloadGiB':15.3},
)

def text_model(model=None):
    selected=model or os.getenv('DAW_TEXT_MODEL','Qwen/Qwen3-4B')
    allowed={m['id'] for m in TEXT_MODELS}
    # An administrator may configure another compatible model; browsers cannot load arbitrary code.
    configured=os.getenv('DAW_TEXT_MODEL')
    if configured:allowed.add(configured)
    if selected not in allowed:raise ValueError('Choose an assistance model offered by this workstation')
    return selected

def text_models():
    models=[dict(m) for m in TEXT_MODELS]
    configured=text_model()
    if configured not in {m['id'] for m in models}:
        models.append({'id':configured,'name':configured,'description':'Configured by your workstation administrator'})
    return models

class ArtworkProvider(Protocol):
    def generate(self, request: dict, destination, progress) -> Iterable[dict]: ...

class TextProvider(Protocol):
    def generate(self, request: dict, progress) -> dict: ...

class VideoProvider(Protocol):
    def generate(self, request: dict, destination, progress) -> list[dict]: ...

def alignment_python():
    from pathlib import Path
    path=Path(os.getenv('DAW_ALIGNMENT_PYTHON','/opt/cadentrail/alignment-runtime/bin/python'))
    return str(path) if path.is_file() else None


def capabilities():
    from .radio_language import LANGUAGES
    local = False
    if importlib.util.find_spec('yue2') is not None:
        try:
            import torch
            local = torch.cuda.is_available()
        except (ImportError, OSError, RuntimeError):
            pass
    artwork = local and importlib.util.find_spec('diffusers') is not None
    text = local and importlib.util.find_spec('transformers') is not None
    upgraded = bool(alignment_python())
    alignment = local and (upgraded or importlib.util.find_spec('faster_whisper') is not None)
    return {
        'artwork': {'available': artwork, 'provider':'local-sdxl', 'model':os.getenv('DAW_ARTWORK_MODEL','stabilityai/stable-diffusion-xl-base-1.0'), 'message': 'Runs on this workstation GPU' if artwork else 'Artwork model runtime is unavailable. Upload an image or use the cover designer.'},
        'text': {'available':text,'provider':'local-qwen','model':text_model(),'models':text_models(),'languages':[{'id':code,'name':'From music description' if code=='auto' else name} for code,name in LANGUAGES.items()]},
        'alignment': {'available':alignment,'provider':'qwen3' if upgraded else 'faster-whisper','model':'Qwen3-ASR + ForcedAligner / Whisper cross-check' if upgraded else 'large-v3','voiceDetection':upgraded,'message':'Song recognition, word alignment and optional voice detection. Review duet assignments.' if upgraded else 'Transcribed words are matched to your lyrics. Uncertain words remain untimed.'},
        'video': {'available':True,'provider':'ffmpeg','aiVideoAvailable':False},
        'realaudio': {'available':local,'provider':'mothersuperior-v4','model':'Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4','experimental':True},
    }

def artwork_provider():
    from .auxiliary import SDXLProvider
    return SDXLProvider()

def text_provider():
    from .auxiliary import QwenProvider
    return QwenProvider()


def video_alignment(options, lyrics, available=None):
    """Resolve once at enqueue; consent and execution use the same provider."""
    available = available or capabilities()
    info = available['alignment']
    selected = options.get('alignmentBackend', 'auto')
    if selected == 'auto': selected = 'qwen3' if info.get('provider') == 'qwen3' else 'whisper'
    if selected == 'qwen3' and info.get('provider') != 'qwen3':
        raise ValueError('The selected alignment runtime is unavailable. Choose automatic or Whisper alignment.')
    return {'backend':selected, 'lyrics':lyrics, 'language':'auto',
            'detectVoices':options.get('detectVoices', True), 'maxVoices':2, 'isolateVocals':False}
