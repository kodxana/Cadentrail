"""Optional monophonic hum guidance for the existing YuE2 pipeline.

Adapter contract and sine-carrier method: Mothersuperior/YuE2-hum-to-song,
revision cd323af53ebf61d613fb3d7717e7c8b9bb67f643, CC BY-NC 4.0.
Cadentrail changes: bounded local pYIN-to-ABC transcription, confidence checks,
validated safetensors, chunked synthesis and the normal project/job lifecycle.
This is an experimental melody aid, not voice cloning or polyphonic transcription.
"""
from __future__ import annotations
import gc
import json
import math
import numpy as np


def check_source(store, project_id, hum):
    asset = store.asset(hum.assetId)
    if asset['projectId'] != project_id:
        raise ValueError('Choose a hum recording from this project')
    if hum.start + hum.duration > float(asset['duration']) + .05:
        raise ValueError('The selected hum region extends beyond the recording')
    return store.asset_path(hum.assetId)


def prepare_hum(path, settings, output, emit):
    import librosa
    import soundfile as sf
    from scipy.signal import resample_poly, butter, sosfiltfilt
    with sf.SoundFile(path) as sound:
        sound.seek(round(settings['start'] * sound.samplerate))
        audio = sound.read(round(settings['duration'] * sound.samplerate), dtype='float32', always_2d=True).mean(1)
        rate = sound.samplerate
    if len(audio) < rate * 3 or not np.isfinite(audio).all():
        raise ValueError('Choose at least three seconds of a clear solo hum')
    if np.sqrt(np.mean(audio ** 2)) < .0005:
        raise ValueError('This recording is too quiet. Record a clearer solo hum.')
    divisor = math.gcd(rate, 48000)
    audio = resample_poly(audio, 48000 // divisor, rate // divisor).astype(np.float32)
    emit(state='Analyzing', message='Finding the melody in your hum', progress=None)
    f0, voiced, probability = librosa.pyin(audio, fmin=65, fmax=1000, sr=48000, hop_length=512, frame_length=2048)
    reliable = voiced & np.isfinite(f0) & (probability >= .15)
    if reliable.mean() < .3 or reliable.sum() * 512 / 48000 < 1.5:
        raise ValueError('The melody is not clear enough. Hum one note at a time without backing music, or choose a clearer region.')
    # Forward-fill only the carrier's pitch. Unvoiced notes remain rests in ABC.
    first = np.flatnonzero(reliable)[0]
    filled = f0.copy(); filled[:first] = f0[first]
    for i in range(first + 1, len(filled)):
        if not np.isfinite(filled[i]): filled[i] = filled[i - 1]
    sample_pitch = np.interp(np.arange(len(audio)) / 48000, np.arange(len(filled)) * 512 / 48000, filled)
    envelope = sosfiltfilt(butter(4, 30, fs=48000, output='sos'), np.abs(audio))
    envelope = sosfiltfilt(butter(2, 80, fs=48000, output='sos'), envelope).clip(0)
    carrier = envelope * np.sin(2 * np.pi * np.cumsum(sample_pitch) / 48000)
    carrier = (carrier / max(1e-9, np.abs(carrier).max()) * .9).astype(np.float32)
    abc = pitch_score(f0, reliable, settings['tempo'])
    result = {'sourceAssetId': settings['assetId'], 'start': settings['start'], 'duration': len(audio) / 48000,
              'tempo': settings['tempo'], 'transcriber': 'librosa-pyin-0.11.0',
              'voicedFraction': round(float(reliable.mean()), 4), 'score': abc,
              'mode': settings['mode'], 'influence': settings['influence'], 'experimental': True}
    (output / 'hum-score.abc').write_text(abc, encoding='utf-8')
    (output / 'hum.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return carrier, abc, result


def pitch_score(f0, reliable, tempo):
    """Quantize a solo pitch track to sixteenth notes at the chosen tempo."""
    from .score import abc_pitch
    seconds_per_tick = 60 / tempo / 4
    midi = np.zeros(len(f0), dtype=int)
    midi[reliable] = np.rint(69 + 12 * np.log2(f0[reliable] / 440)).astype(int)
    ticks = []
    for start in np.arange(0, len(f0) * 512 / 48000, seconds_per_tick):
        a = round(start * 48000 / 512); b = min(len(f0), max(a + 1, round((start + seconds_per_tick) * 48000 / 512)))
        good = reliable[a:b]
        ticks.append(int(np.median(midi[a:b][good])) if len(good) and good.mean() >= .5 else 0)
    while ticks and ticks[-1] == 0: ticks.pop()
    if sum(p > 0 for p in ticks) < 8:
        raise ValueError('Too few stable notes were detected. Choose a longer, clearer hum.')
    lines = ['X:1', 'M:4/4', 'L:1/16', f'Q:1/4={tempo}', 'K:C', '%%propagate-accidentals not', 'V:Vocal']
    for start in range(0, len(ticks), 16):
        bar = ticks[start:start + 16]; tokens = []; i = 0
        while i < len(bar):
            j = i + 1
            while j < len(bar) and bar[j] == bar[i]: j += 1
            pitch = abc_pitch(bar[i]) if bar[i] else 'z'
            if bar[i] and not pitch.startswith('^'): pitch = '=' + pitch
            tokens.append(pitch + (str(j - i) if j - i > 1 else '')); i = j
        lines.append(' '.join(tokens) + ' |')
    # A single open melody voice lets YuE2 continue the hum instead of a rest-only accompaniment.
    return '\n'.join(lines) + '\n'


def plan_hum(pipe, kwargs, abc, mode):
    from yue2.protocol import SongRequest, token_prefixes, resolve_sampling
    from yue2.pipeline import SymbolicPlan
    kwargs = {**kwargs, 'cot': 'melody'}
    kwargs.pop('abc', None)
    if mode == 'melody':
        return pipe.plan(**kwargs, abc=abc)
    request = SongRequest(**kwargs)
    partial = pipe.tokenizer.encode(abc)
    prefix = token_prefixes(request, pipe.tokenizer) + partial
    sampling = resolve_sampling(None, pipe.generation_config.abc)
    ids, timing, truncated = pipe._generate(prefix, sampling, request.seed, 'abc')
    full = partial + list(ids)
    return SymbolicPlan(request, pipe.tokenizer.decode(full), full,
                        token_prefixes(request, pipe.tokenizer, full), timing, truncated)


def install_adapter(pipe, tensors):
    import torch
    model = pipe._load_model()
    expected = set(); changes = []
    for index, layer in enumerate(model.model.layers):
        for block, names in (('nar_self_attn', ('q_proj', 'k_proj', 'v_proj', 'o_proj')),
                             ('nar_mlp', ('gate_proj', 'up_proj', 'down_proj'))):
            for name in names:
                prefix = f'layers.{index}.{block}.{name}'
                akey, bkey = prefix + '.lora_A', prefix + '.lora_B'; expected.update((akey, bkey))
                a, b = tensors.get(akey), tensors.get(bkey)
                weight = getattr(getattr(layer, block), name).weight
                if a is None or b is None or a.ndim != 2 or b.ndim != 2 or a.shape[0] != b.shape[1] or (b.shape[0], a.shape[1]) != tuple(weight.shape):
                    raise ValueError('The Hum-to-Song adapter does not match this YuE2 model')
                changes.append((weight, a, b))
    replacements = []
    for name in ('vae2llm', 'llm2vae'):
        module = getattr(model, name)
        for field, original in module.state_dict().items():
            key = name + '.' + field; expected.add(key)
            if key not in tensors or tensors[key].shape != original.shape:
                raise ValueError('The Hum-to-Song audio projections are incomplete')
            replacements.append((getattr(module, field), tensors[key]))
    projections = torch.nn.ModuleList([torch.nn.Linear(64, model.config.hidden_size) for _ in range(4)])
    for key, weight in projections.state_dict().items():
        source = 'hum_proj.' + key; expected.add(source)
        if source not in tensors or tensors[source].shape != weight.shape:
            raise ValueError('The Hum-to-Song conditioning projections are incomplete')
    if set(tensors) != expected or any(not torch.isfinite(t).all() for t in tensors.values()):
        raise ValueError('Unexpected or invalid Hum-to-Song weights')
    projections.load_state_dict({k: tensors['hum_proj.' + k] for k in projections.state_dict()}, strict=True)
    with torch.no_grad():
        for weight, a, b in changes:
            weight.add_((b.to(weight.device).float() @ a.to(weight.device).float()).to(weight.dtype))
        for weight, replacement in replacements: weight.copy_(replacement)
    pipe.hum_projections = projections.eval().to(device=pipe.device, dtype=torch.bfloat16)


def synthesize_hum(pipe, semantic, carrier, influence, emit):
    import torch
    import torch.nn.functional as F
    from yue2.modeling_vae import YuE2VAE
    from yue2.nar import CachedNAR, song_chunks
    # Encode the short carrier separately; do not keep the full VAE and song model on GPU together.
    model = pipe._model
    if model is not None: model.to('cpu')
    if pipe._vae is not None: pipe._vae.to('cpu')
    gc.collect(); torch.cuda.empty_cache()
    vae = YuE2VAE.from_pretrained(pipe.vae_dir, decoder_only=False, device=pipe.device, local_files_only=True)
    with torch.inference_mode():
        signal = torch.from_numpy(np.stack((carrier, carrier)))[None]
        conditioning = vae.encode(signal)[0].T.float().cpu()
    del vae; gc.collect(); torch.cuda.empty_cache()
    model = pipe._load_model(for_nar=True)

    class HumNAR(CachedNAR):
        def __init__(self, chunk, condition):
            super().__init__(model, chunk)
            padded = F.pad(condition, (0, 0, 1, 1))[None].to(self.device, self.dtype)
            self.guidance = [{layer: projection(value) for layer, projection in zip((0, 7, 14, 21), pipe.hum_projections)}
                             for value in (padded, torch.zeros_like(padded))]

        def conditioned_velocity(self, state, raw_t, extra):
            shifted = model._shift_t_value(raw_t, self.device, self.dtype)
            x = model.vae2llm(F.pad(state, (0, 0, 1, 1))[None].to(self.dtype)) + extra[0]
            x = x + model.time_embedder(shifted.expand(self.nar_length))[None] + self.pos_emb
            for index, (layer, (ar_k, ar_v)) in enumerate(zip(model.model.layers, self.cache)):
                if index in extra and index: x = x + extra[index]
                q, k, v = layer.nar_self_attn.project_qkv(layer.nar_input_layernorm(x), self.cos, self.sin)
                attended = self._attention(q[0], torch.cat((ar_k, k[0])), torch.cat((ar_v, v[0])))
                x = x + layer.nar_self_attn.o_proj(attended.flatten(1)[None])
                x = x + layer.nar_mlp(layer.nar_pre_mlp_layernorm(x))
            return model.llm2vae(model.model.norm(x))[0, 1:-1].float()

        def solve(self, steps, on_progress):
            state = self.chunk.noise.to(self.device).float()
            for step in range(steps):
                def raw(t):
                    t = min(max(t, 1e-4), 1 - 1e-4)
                    return math.log(t / (1 - t))
                t = 1 - step / steps
                first = self.velocity(state, raw(t))
                state = state - self.velocity(state - first / (2 * steps), raw(t - .5 / steps)) / steps
                on_progress(step + 1, steps)
            if not torch.isfinite(state).all():
                raise FloatingPointError('Hum-guided synthesis produced non-finite latents')
            return state.cpu()

        def velocity(self, state, raw_t):
            with_hum = self.conditioned_velocity(state, raw_t, self.guidance[0])
            if influence == 1: return with_hum
            without = self.conditioned_velocity(state, raw_t, self.guidance[1])
            return without + influence * (with_hum - without)

    chunks = song_chunks(semantic.plan.prefix, semantic.tokens, semantic.plan.request.seed, pipe.generation_config.context)
    results = []; offset = 0; steps = pipe.generation_config.ode_steps
    with torch.inference_mode():
        for index, chunk in enumerate(chunks):
            count = len(chunk.noise); condition = torch.zeros(count, 64)
            length = max(0, min(count, len(conditioning) - offset))
            if length: condition[:length] = conditioning[offset:offset + length]
            engine = HumNAR(chunk, condition)
            try:
                def progress(done, total):
                    emit(state='Rendering', message='Shaping the performance from your hum',
                         progress=(index * steps + done) / (len(chunks) * steps),
                         progressLabel='Hum-guided synthesis', unitsDone=index * steps + done,
                         unitsTotal=len(chunks) * steps, unit='steps')
                results.append(engine.solve(steps, on_progress=progress))
            finally:
                engine.close()
                del engine
            offset += count
    return torch.cat(results).numpy()


def remap_hum_sources(project, mapping):
    if project.generation.hum:
        old = project.generation.hum.assetId
        if old not in mapping: raise ValueError('Hum recording is missing from the project')
        project.generation.hum.assetId = mapping[old]
    for candidate in project.candidates:
        for data, key in ((candidate.metadata.get('generation', {}).get('hum'), 'assetId'),
                          (candidate.metadata.get('hum'), 'sourceAssetId')):
            if isinstance(data, dict) and data.get(key) in mapping: data[key] = mapping[data[key]]
