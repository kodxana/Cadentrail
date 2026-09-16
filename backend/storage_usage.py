"""Measure workspace files without mistaking a shared host filesystem for a Pod quota."""
from __future__ import annotations
import math, os, shutil, stat, threading, time
from pathlib import Path

_cache = {}
_lock = threading.Lock()

def measure_files(root):
    total=0;seen=set();complete=True;pending=[Path(root)]
    while pending:
        directory=pending.pop()
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    try:
                        info=entry.stat(follow_symlinks=False)
                        if stat.S_ISDIR(info.st_mode):pending.append(Path(entry.path))
                        elif stat.S_ISREG(info.st_mode):
                            if not info.st_ino:info=os.stat(entry.path,follow_symlinks=False)
                            identity=(info.st_dev,info.st_ino) if info.st_ino else entry.path
                            if identity not in seen:total+=info.st_size;seen.add(identity)
                    except FileNotFoundError:pass  # Atomic renames during downloads.
                    except OSError:complete=False
        except OSError:complete=False
    return total,complete

def storage_usage(root,refresh=False):
    root=Path(root).resolve()
    configured_root=os.getenv('DAW_STORAGE_VOLUME_ROOT')
    volume=Path(configured_root).resolve() if configured_root else (Path('/workspace') if os.getenv('RUNPOD_POD_ID') and root.is_relative_to('/workspace') else root)
    if not root.is_relative_to(volume):raise ValueError('DAW_STORAGE_VOLUME_ROOT must contain DAW_STORAGE')
    allowance=os.getenv('DAW_STORAGE_CAPACITY_GB','').strip()
    capacity=None
    if allowance:
        value=float(allowance)
        if not math.isfinite(value) or value<=0:raise ValueError('DAW_STORAGE_CAPACITY_GB must be a positive number')
        capacity=int(value*1_000_000_000)
    key=(str(volume),capacity,bool(os.getenv('RUNPOD_POD_ID')))
    with _lock:
        cached=_cache.get(key)
        if not refresh and cached and time.monotonic()-cached[0]<15:return dict(cached[1])
        used,complete=measure_files(volume)
        disk=shutil.disk_usage(root)
        source='configured' if capacity is not None else 'unknown' if os.getenv('RUNPOD_POD_ID') else 'filesystem'
        if source=='configured':available=min(disk.free,max(0,capacity-used)) if complete else None
        elif source=='filesystem':available=disk.free
        else:available=None  # Shared Runpod statvfs values are not the user's allowance.
        result={'usedBytes':used,'capacityBytes':capacity,'availableBytes':available,'source':source,'complete':complete,'measuredAt':time.time()}
        _cache[key]=(time.monotonic(),result)
        return dict(result)
