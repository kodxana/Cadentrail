"""Stable request identities; download consent is not part of generation intent."""
import hashlib, json, re

def identity(scope, key, payload):
    if not key: return None, None
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', key):
        raise ValueError('Invalid submission key')
    data = {k:v for k,v in payload.items() if k != 'approvedDownloads'}
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return scope + ':' + key, digest
