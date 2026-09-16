"""Media ingestion and bounded analysis. Original uploads remain immutable."""
from __future__ import annotations
import io
import json
import math
import subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy import signal
from PIL import Image
from .schema import uid


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def convert(source: Path, target: Path, *, sample_rate=48000, subtype="FLOAT"):
    codec = {"FLOAT": "pcm_f32le", "PCM_24": "pcm_s24le", "PCM_16": "pcm_s16le"}[subtype]
    result = subprocess.run([ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-vn", "-ac", "2", "-ar", str(sample_rate), "-c:a", codec, str(target)], capture_output=True, timeout=600)
    if result.returncode:
        raise ValueError("Cannot decode this audio format: " + result.stderr.decode(errors="replace")[-800:])


def build_peaks(path: Path, destination: Path):
    """Stream through source once; all coarser pyramid levels derive from base peaks."""
    blocks = []
    with sf.SoundFile(path) as f:
        sr, channels, frames = f.samplerate, f.channels, len(f)
        for block in f.blocks(blocksize=256, dtype="float32", always_2d=True):
            blocks.append(np.stack((block.min(axis=0), block.max(axis=0)), axis=-1))
    base = np.asarray(blocks, dtype=np.float32)
    levels = []
    hop = 256
    while len(base):
        filename = f"{destination.stem}-{hop}.json"
        (destination.parent / filename).write_text(json.dumps({"hop": hop, "sampleRate": sr, "channels": channels, "peaks": np.round(base, 5).tolist()}, separators=(",", ":")), encoding="utf-8")
        levels.append({"hop": hop, "file": filename, "length": len(base)})
        if len(base) <= 256:
            break
        count = math.ceil(len(base) / 4)
        padded = np.pad(base, ((0, count * 4 - len(base)), (0, 0), (0, 0)), mode="edge").reshape(count, 4, channels, 2)
        base = np.stack((padded[:, :, :, 0].min(axis=1), padded[:, :, :, 1].max(axis=1)), axis=-1)
        hop *= 4
    result = {"sampleRate": sr, "channels": channels, "frames": frames, "levels": levels}
    destination.write_text(json.dumps(result), encoding="utf-8")
    return result


def analyze(path: Path):
    """Exact sample statistics, 4x estimated true peak; loudness requires full program."""
    peak, sq, dc, clipped, silent, frames = 0., np.zeros(2), np.zeros(2), 0, 0, 0
    true_peak, cross = 0., 0.
    mono_blocks = []
    with sf.SoundFile(path) as f:
        sr, duration = f.samplerate, len(f) / f.samplerate
        for block in f.blocks(blocksize=sr * 10, dtype="float32", always_2d=True):
            if block.shape[1] == 1:
                block = np.repeat(block, 2, axis=1)
            if not np.isfinite(block).all():
                raise ValueError("Audio contains invalid samples")
            peak = max(peak, float(np.max(np.abs(block))))
            true_peak = max(true_peak, float(np.max(np.abs(signal.resample_poly(block, 4, 1, axis=0)))))
            sq += np.sum(block.astype(np.float64) ** 2, axis=0)
            dc += block.sum(axis=0, dtype=np.float64)
            cross += float(np.sum(block[:, 0].astype(np.float64) * block[:, 1]))
            clipped += int(np.count_nonzero(np.abs(block) >= 1))
            silent += int(np.count_nonzero(np.max(np.abs(block), axis=1) < 1e-4))
            frames += len(block)
            # Low-rate analysis buffer is bounded to first 20 min.
            if len(mono_blocks) < 120:
                mono_blocks.append(signal.resample_poly(block.mean(axis=1), 1, max(1, sr // 8000)))
    if not frames:
        raise ValueError("Audio file is empty")
    rms = np.sqrt(sq / frames)
    db = lambda x: round(20 * math.log10(max(float(x), 1e-9)), 2)
    result = {"duration": duration, "sampleRate": sr, "peakDb": db(peak), "truePeakDb": db(true_peak), "truePeakMethod": "4x polyphase estimate", "rmsDb": [db(x) for x in rms], "dcOffset": (dc / frames).tolist(), "clippedSamples": clipped, "silenceFraction": silent / frames, "correlation": float(cross / max(1e-12, math.sqrt(sq[0] * sq[1]))), "lufs": None, "bpm": None, "bpmConfidence": 0, "warnings": []}
    loud = subprocess.run([ffmpeg(), "-nostdin", "-hide_banner", "-i", str(path), "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, timeout=600)
    import re
    match = re.search(r'\{\s*"input_i".*?\}', loud.stderr.decode(errors="replace"), re.S)
    if match:
        loudness = json.loads(match.group())
        value = float(loudness["input_i"])
        result["lufs"] = round(value, 2) if math.isfinite(value) else None
        tp = float(loudness["input_tp"])
        if math.isfinite(tp):
            result["truePeakDb"] = tp
            result["truePeakMethod"] = "FFmpeg loudnorm oversampled"
    if mono_blocks:
        mono = np.concatenate(mono_blocks)
        env = np.maximum(0, np.diff(np.sqrt(np.mean(np.pad(mono, (0, (-len(mono)) % 160)).reshape(-1, 160) ** 2, axis=1))))
        if len(env) > 200 and env.max() > 1e-5:
            corr = signal.correlate(env, env, mode="full", method="fft")[len(env)-1:]
            low, high = 15, min(75, len(corr))
            lag = low + int(np.argmax(corr[low:high]))
            result["bpm"] = round(60 * 50 / lag, 1)
            result["bpmConfidence"] = round(float(corr[lag] / max(corr[0], 1e-12)), 3)
    if clipped:
        result["warnings"].append("Samples reach or exceed full scale")
    if result["silenceFraction"] > .2:
        result["warnings"].append("More than 20% near-silence; inspect structure")
    result["warnings"].append("Tempo is an estimate; beat grid was not changed")
    return result


def spectrogram(path: Path, destination: Path):
    with sf.SoundFile(path) as f:
        sr = f.samplerate
        duration = len(f) / sr
        columns = min(2400, max(100, int(duration * 12)))
        spectrum = []
        frequencies = np.geomspace(30, min(20000, sr / 2), 384)
        bins = np.fft.rfftfreq(2048, 1 / sr)
        for pos in np.linspace(0, max(0, len(f) - 2048), columns).astype(int):
            f.seek(pos)
            block = f.read(2048, dtype="float32", always_2d=True).mean(axis=1)
            block = np.pad(block, (0, 2048-len(block)))
            mag = np.abs(np.fft.rfft(block * np.hanning(2048))) / 512
            spectrum.append(np.interp(frequencies, bins, 20 * np.log10(np.maximum(mag, 1e-6))))
    db = np.asarray(spectrum).T[::-1]
    v = np.clip((db + 90) / 90, 0, 1)
    # A fixed perceptual map, not normalized per file: intensity remains comparable.
    stops = np.array([[13, 17, 25], [38, 34, 75], [40, 113, 136], [90, 196, 161], [244, 220, 129]])
    idx = v * 4
    lo = np.minimum(idx.astype(int), 3)
    rgb = stops[lo] * (1 - (idx-lo))[..., None] + stops[lo+1] * (idx-lo)[..., None]
    Image.fromarray(rgb.astype(np.uint8)).save(destination)
    return {"duration": duration, "minHz": 30, "maxHz": float(frequencies[-1]), "scale": "log", "minDb": -90, "maxDb": 0}


def ingest(store, project_id, source: Path, name: str, origin="import", lineage=None):
    asset_id = uid()
    root = store.project_dir(project_id)
    dest = root / "audio" / f"{asset_id}.wav"
    convert(source, dest)
    info = sf.info(dest)
    if info.duration > 3600:
        dest.unlink()
        raise ValueError("Maximum audio length is one hour per asset")
    peaks = build_peaks(dest, root / "waveforms" / f"{asset_id}.json")
    stats = analyze(dest)
    spec = spectrogram(dest, root / "spectrograms" / f"{asset_id}.png")
    return store.add_asset(project_id, {"id": asset_id, "name": name[:180], "path": f"audio/{asset_id}.wav", "originalPath": str(source.relative_to(root)) if source.is_relative_to(root) else None, "duration": info.duration, "sampleRate": info.samplerate, "channels": info.channels, "origin": origin, "lineage":lineage or {}, "peaks": peaks, "analysis": stats, "spectrogram": spec})


def segment(path, start: float, duration: float, reverse=False):
    with sf.SoundFile(path) as f:
        f.seek(min(len(f), int(start * f.samplerate)))
        audio = f.read(int(duration * f.samplerate), dtype="float32", always_2d=True)
        sr = f.samplerate
    if reverse:
        audio = audio[::-1]
    data = io.BytesIO()
    sf.write(data, audio, sr, format="WAV", subtype="FLOAT")
    return data.getvalue()
