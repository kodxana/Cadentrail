"""Server mix renderer. Audio is accumulated one track at a time to bound RAM."""
from __future__ import annotations
import math
import subprocess
import json
from pathlib import Path
import numpy as np
import soundfile as sf
from .schema import uid
from .audio import ffmpeg


def effect_filters(effects):
    result = []
    for fx in effects:
        if fx.bypass:
            continue
        p = fx.params
        if fx.type == "eq":
            result.append(f"equalizer=f={p.get('frequency',1000)}:t=q:w={p.get('q',1)}:g={p.get('gain',0)}")
        elif fx.type in ("highpass", "lowpass"):
            result.append(f"{fx.type}=f={p.get('frequency',80 if fx.type=='highpass' else 14000)}")
        elif fx.type == "gain":
            result.append(f"volume={p.get('gain',1)}")
        elif fx.type in ("compressor", "limiter"):
            result.append(f"acompressor=threshold={max(.001,10**(p.get('threshold',-18)/20))}:ratio={p.get('ratio',4)}:attack={max(.01,p.get('attack',.01)*1000)}:release={max(.01,p.get('release',.15)*1000)}:knee={max(1,min(8,1+p.get('knee',12)/6))}")
        elif fx.type == "width":
            w = p.get("width", 1)
            result.append(f"pan=stereo|c0={(1+w)/2}*c0+{(1-w)/2}*c1|c1={(1-w)/2}*c0+{(1+w)/2}*c1")
        else:
            raise ValueError(f"Server export does not yet reproduce {fx.type}. Use browser render for the complete insert chain, or bypass this effect explicitly.")
    return result


def render_job(store, job):
    project = store.load(job["projectId"])
    options = job["request"].get("options", {})
    # Export a pinned revision, not a moving target while the worker is queued.
    revision = job.get("projectRevision", project.revision)
    with store.connect() as db:
        row = db.execute("SELECT data FROM revisions WHERE project_id=? AND revision=?", (project.id, revision)).fetchone()
    if row:
        from .schema import Project
        project = Project.model_validate_json(row[0])
    sr = int(options.get("sampleRate", 48000))
    if sr not in (44100, 48000, 96000):
        raise ValueError("Supported render rates: 44100, 48000, 96000")
    format = options.get("format", "wav")
    if format not in ("wav", "flac", "mp3"):
        raise ValueError("Unsupported export format")
    bps = project.tempo / 60
    end = max((c.beat+c.duration for t in project.tracks for c in t.clips), default=16)
    start_beat = project.loopStart if options.get("region") else 0
    end_beat = project.loopEnd if options.get("region") else end
    duration = (end_beat-start_beat)/bps
    tail = float(options.get('tailSeconds', 0))
    if not math.isfinite(tail) or not 0 <= tail <= 30: raise ValueError('Effect tail must be between 0 and 30 seconds')
    if not 0 < duration or duration + tail > 1200:
        raise ValueError("Server render supports up to 20 minutes including the effect tail")
    # Native source rate, one accumulator and one channel buffer. 300 s stereo is ~115 MB each.
    native = 48000
    arrangement_frames = math.ceil(duration*native)
    frames = math.ceil((duration+tail)*native)
    mixed = np.zeros((frames, 2), dtype=np.float32)
    solo = any(t.solo for t in project.tracks)
    if any(t.output != "master" for t in project.tracks):
        raise ValueError("Use browser render for bus routing")
    if any(c.notes for t in project.tracks for c in t.clips):
        raise ValueError("Use browser render to include the workstation instruments")
    temp = store.project_dir(project.id) / "renders"
    for track in project.tracks:
        if track.mute or (solo and not track.solo):
            continue
        if store.job(job["id"])["state"] == "Cancelled":
            return
        filters = effect_filters(track.effects)
        data = np.zeros((frames, 2), dtype=np.float32)
        store.patch_job(job["id"], state="Rendering", message=f"Rendering {track.name}")
        for clip in track.clips:
            if not clip.assetId or clip.muted:
                continue
            clip_start = (clip.beat-start_beat)/bps
            seconds = clip.duration/bps
            begin = max(0, int(clip_start*native))
            finish = min(arrangement_frames, int((clip_start+seconds)*native))
            if finish <= begin:
                continue
            skip = max(0, -clip_start)
            with sf.SoundFile(store.asset_path(clip.assetId)) as f:
                if f.samplerate != native:
                    raise ValueError("Asset sample rate must be normalized before mixing")
                source_offset = clip.offset + (seconds - skip - (finish-begin)/native if clip.reverse else skip)
                f.seek(min(len(f), max(0, int(source_offset*native))))
                block = f.read(finish-begin, dtype="float32", always_2d=True)
            if clip.reverse:
                block = block[::-1]
            local = np.arange(len(block))/native + skip
            envelope = np.ones(len(block), dtype=np.float32)*clip.gain
            if clip.fadeIn:
                envelope *= np.minimum(1, local/(clip.fadeIn/bps))
            if clip.fadeOut:
                envelope *= np.minimum(1, (seconds-local)/(clip.fadeOut/bps))
            data[begin:begin+len(block)] += block*envelope[:,None]
        if filters:
            raw, processed = temp / (uid()+".wav"), temp / (uid()+".wav")
            sf.write(raw, data, native, subtype="FLOAT")
            proc = subprocess.run([ffmpeg(), "-nostdin", "-y", "-i", str(raw), "-af", ",".join(filters), "-c:a", "pcm_f32le", str(processed)], capture_output=True, timeout=600)
            if proc.returncode:
                raise ValueError("Effect render failed: "+proc.stderr.decode(errors="replace")[-400:])
            data, _ = sf.read(processed, dtype="float32", always_2d=True)
            raw.unlink(missing_ok=True)
            processed.unlink(missing_ok=True)
        beats = np.arange(frames)/native*bps+start_beat
        volume, pan = np.full(frames, track.volume, dtype=np.float32), np.full(frames, track.pan, dtype=np.float32)
        for a in track.automation:
            if not a.enabled or not a.points:
                continue
            xp, yp = [p.beat for p in a.points], [p.value for p in a.points]
            curve = np.interp(beats, xp, yp) if a.interpolation == "linear" else np.asarray(yp)[np.maximum(0,np.searchsorted(xp,beats,side='right')-1)]
            if a.parameter == "volume":
                volume = curve
            else:
                pan = curve
        # Stereo equal-power balance follows Web Audio's stereo panner law.
        l, r = data[:,0].copy(), data[:,1].copy()
        neg = pan <= 0
        angle = np.where(neg, (pan+1)*math.pi/2, pan*math.pi/2)
        data[:,0] = np.where(neg, l+r*np.cos(angle), l*np.cos(angle))*volume
        data[:,1] = np.where(neg, r*np.sin(angle), r+l*np.sin(angle))*volume
        mixed += data[:frames]
    mixed *= project.masterVolume
    raw = temp / (uid()+"-mix.wav")
    sf.write(raw, mixed, native, subtype="FLOAT")
    output = store.root / "exports" / (job["id"] + "." + format)
    encode(raw, output, options)
    store.patch_job(job["id"], output=output.name, message="Mix exported", renderRevision=revision)


def encode(source: Path, output: Path, options):
    rate = int(options.get("sampleRate", 48000))
    depth = int(options.get("bitDepth", 24))
    if rate not in (44100,48000,96000) or depth not in (16,24,32):
        raise ValueError("Invalid sample rate or bit depth")
    filters = []
    if options.get("master"):
        target = max(-24, min(-9, float(options.get("lufs", -14))))
        # Two-pass loudnorm preserves dynamics when linear normalization is feasible.
        probe = subprocess.run([ffmpeg(),"-nostdin","-hide_banner","-i",str(source),"-af",f"loudnorm=I={target}:TP=-1.1:LRA=11:print_format=json","-f","null","-"],capture_output=True,timeout=600)
        if probe.returncode: raise ValueError('Mastering measurement failed')
        import re
        match = re.search(r'\{\s*"input_i".*?\}',probe.stderr.decode(errors='replace'),re.S)
        if match and all(math.isfinite(float(v)) for k,v in json.loads(match.group()).items() if k.startswith('input_') or k=='target_offset'):
            d=json.loads(match.group())
            filters.append(f"loudnorm=I={target}:TP=-1.1:LRA=11:measured_I={d['input_i']}:measured_TP={d['input_tp']}:measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:offset={d['target_offset']}:linear=true")
        elif not match or json.loads(match.group()).get('input_i') != '-inf':
            raise ValueError('Could not obtain a valid loudness measurement')
    filters.append(f"aresample={rate}:dither_method={'triangular' if depth==16 else 'none'}")
    codec = ["-c:a", "flac", "-sample_fmt", "s16" if depth==16 else "s32"] if output.suffix=='.flac' else ["-c:a","libmp3lame","-b:a","320k"] if output.suffix=='.mp3' else ["-c:a",{16:"pcm_s16le",24:"pcm_s24le",32:"pcm_f32le"}[depth]]
    attenuation = 0.0
    for attempt in range(3):
        final_filters = filters + ([f'volume={attenuation}dB'] if attenuation else [])
        proc=subprocess.run([ffmpeg(),"-nostdin","-y","-i",str(source),"-af",','.join(final_filters),"-ar",str(rate),*codec,str(output)],capture_output=True,timeout=600)
        if proc.returncode:
            raise ValueError("Export encoding failed: "+proc.stderr.decode(errors='replace')[-500:])
        if not options.get('master'): return
        # Inspect the encoded deliverable, including codec-created intersample peaks.
        probe=subprocess.run([ffmpeg(),'-nostdin','-hide_banner','-i',str(output),'-af','loudnorm=I=-14:TP=-1.1:LRA=11:print_format=json','-f','null','-'],capture_output=True,timeout=600)
        match=re.search(r'\{\s*"input_i".*?\}',probe.stderr.decode(errors='replace'),re.S)
        if probe.returncode or not match: raise ValueError('Final true-peak verification failed')
        peak=float(json.loads(match.group())['input_tp'])
        if peak <= -1.0: return
        attenuation -= peak + 1.15
    raise ValueError('Could not meet the final -1 dBTP ceiling; the raw mix is preserved')
