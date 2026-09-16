"""Reviewed music adapters; never subtract rounded deltas from resident weights.

Weights remain separately licensed to Mothersuperior under CC BY-NC 4.0.
The application implements the documented merge contract using safetensors only.
"""
from __future__ import annotations
import hashlib
import re

INSTRUMENTAL = 'instrumental-v1'
HUM = 'hum-v1'


def resolve_vocals(vocals, description):
    if vocals != 'auto':
        return vocals
    text = description.casefold()
    if re.search(r'\b(no vocals?|without (?:singing|vocals?)|no singing)\b', text):
        return 'instrumental'
    if re.search(r'\b(vocals?|singer|singing|choir|choral|opera|duet)\b', text):
        return 'auto'
    if re.search(r'\bnot[ -]instrumental\b', text):
        return 'auto'
    # An instrumental intro/bridge does not make the entire song instrumental.
    whole_song = re.sub(r'\binstrumental\s+(?:intro|outro|bridge|break|breakdown|solo|section)s?\b', '', text)
    if re.search(r'\binstrumental\b', whole_song):
        return 'instrumental'
    if re.search(r'\b(classical|orchestral|symphony|concerto|sonata|chamber music)\b', text):
        return 'instrumental'
    return 'auto'


def role_for(gen):
    return resolve_vocals(gen.get('role', 'auto'), gen.get('style', ''))


def adapter_keys(gen):
    choice = gen.get('musicAdapter', 'auto')
    if choice not in ('auto', 'base', INSTRUMENTAL):
        raise ValueError('Choose an available music adapter')
    role = role_for(gen)
    if choice == INSTRUMENTAL and role != 'instrumental':
        raise ValueError('The instrumental adapter requires Instrumental vocal direction')
    keys = [INSTRUMENTAL] if choice == INSTRUMENTAL or (choice == 'auto' and role == 'instrumental') else []
    if gen.get('hum'):
        keys.append(HUM)
    return keys


def instrumental_sections(text):
    """Only section tags reach the instrumental lyrics channel; never prose."""
    tags = re.findall(r'\[\s*(intro|verse|pre-chorus|chorus|bridge|outro|instrumental)\s*\]', text, re.I)
    return '\n'.join('[' + tag.lower() + ']' for tag in tags[:32]) or '[instrumental]'


def generation_kwargs(gen, seed):
    role = role_for(gen)
    directions = {'male': 'male lead vocal', 'female': 'female lead vocal',
                  'duet': 'duet with two distinct vocalists', 'dialogue': 'alternating vocal dialogue',
                  'shared': 'ensemble shared vocals', 'instrumental': 'instrumental, no vocals, no singing'}
    style = gen['style'] + (', ' + directions[role] if role in directions else '')
    lyrics = gen['lyrics']
    if role == 'instrumental':
        lyrics = instrumental_sections(gen.get('instrumentalSections', '')) if INSTRUMENTAL in adapter_keys(gen) else ''
    result = dict(style=style, lyrics=lyrics, cot=gen['cot'], seed=seed, cfg_scale=gen.get('cfgScale'))
    if gen.get('useScore') and gen.get('abc'):
        result['abc'] = gen['abc']
    return result


def adapter_identity(key):
    from .model_runtime import MODELS
    spec = MODELS[key]
    return {'id': key, 'name': spec['name'], 'repo': spec['repo'], 'revision': spec['revision'],
            'sha256': spec['files'][0]['sha256'], 'scale': 1.0, 'license': 'CC-BY-NC-4.0'}


def load_tensors(root, key):
    from .model_runtime import MODELS, model_path, bundled_path
    from safetensors.torch import load_file
    spec = MODELS[key]
    file = spec['files'][0]
    path = model_path(root, key) / file['path']
    with path.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != file['sha256']:
            recovery = 'Pull the complete Cadentrail image again.' if bundled_path(key) else 'Remove this optional model in Workstation tools, then download it again.'
            raise ValueError(spec['name'] + ' failed its checksum. ' + recovery)
    return load_file(str(path), device='cpu')


def merge_instrumental(model, tensors):
    """Validate every tensor before touching the model; caller discards on failure."""
    import torch
    expected = set()
    merges = []
    for index, layer in enumerate(model.model.layers):
        for block, names in (('self_attn', ('q_proj', 'k_proj', 'v_proj', 'o_proj')),
                             ('mlp', ('gate_proj', 'up_proj', 'down_proj'))):
            for name in names:
                prefix = f'layers.{index}.{block}.{name}'
                akey, bkey = prefix + '.lora_A', prefix + '.lora_B'
                expected.update((akey, bkey))
                if akey not in tensors or bkey not in tensors:
                    raise ValueError('The instrumental adapter is missing a layer')
                a, b = tensors[akey], tensors[bkey]
                weight = getattr(getattr(layer, block), name).weight
                if a.ndim != 2 or b.ndim != 2 or a.shape[0] != b.shape[1] or (b.shape[0], a.shape[1]) != tuple(weight.shape):
                    raise ValueError('The instrumental adapter does not match this YuE2 model')
                if not torch.isfinite(a).all() or not torch.isfinite(b).all():
                    raise ValueError('The instrumental adapter contains invalid values')
                merges.append((weight, a, b))
    if set(tensors) != expected:
        raise ValueError('Unexpected tensors in the instrumental adapter')
    with torch.no_grad():
        for weight, a, b in merges:
            delta = b.to(device=weight.device, dtype=torch.float32) @ a.to(device=weight.device, dtype=torch.float32)
            weight.add_(delta.to(weight.dtype))


def configure_pipeline(pipe, root, keys):
    if INSTRUMENTAL in keys:
        merge_instrumental(pipe._load_model(), load_tensors(root, INSTRUMENTAL))
    if HUM in keys:
        from .hum_song import install_adapter
        install_adapter(pipe, load_tensors(root, HUM))
    return [adapter_identity(key) for key in keys]
