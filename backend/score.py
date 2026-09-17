"""ABC/MIDI interchange with explicit normalization boundaries."""
from fractions import Fraction
import io
import re
import mido
from .schema import Note, Chord, uid


def parse_abc(text: str):
    from music21 import converter, harmony, note, chord, tempo, meter
    if len(text) > 100000 or not re.search(r"^K:", text, re.M):
        raise ValueError("ABC requires a key header (K:) and must be under 100 KB")
    try:
        score = converter.parseData(text, format="abc")
    except Exception as e:
        raise ValueError(f"Could not parse ABC: {str(e)[:250]}") from e
    notes, chords, warnings = [], [], []
    # Expand repeat notation to its sounding performance for a faithful piano roll.
    try:
        score = score.expandRepeats()
    except Exception:
        warnings.append("Repeat expansion unavailable; review playback order")
    score = score.stripTies(inPlace=False)
    parts = list(score.parts) or [score]
    for channel, part in enumerate(parts):
        for n in part.flatten().notes:
            beat, duration = float(n.offset), float(n.quarterLength)
            if isinstance(n, harmony.ChordSymbol):
                chords.append(Chord(beat=max(0, beat), duration=4, symbol=n.figure.replace("-", "b")).model_dump())
            elif isinstance(n, (note.Note, chord.Chord)) and duration > 0:
                for pitch in (n.pitches if isinstance(n, chord.Chord) else [n.pitch]):
                    notes.append(Note(beat=max(0, beat), duration=duration, pitch=int(pitch.midi), velocity=n.volume.velocity or 96, channel=min(channel, 15)).model_dump())
    notes.sort(key=lambda n: (n["beat"], n["pitch"]))
    chords.sort(key=lambda c: c["beat"])
    end = max((n["beat"] + n["duration"] for n in notes), default=16)
    for i, c in enumerate(chords):
        c["duration"] = max(.25, (chords[i+1]["beat"] if i+1 < len(chords) else end) - c["beat"])
    mm = list(score.recurse().getElementsByClass(tempo.MetronomeMark))
    ts = list(score.recurse().getElementsByClass(meter.TimeSignature))
    warnings.append("Visual editing normalizes engraving, repeats and articulations; original ABC is preserved in generation history")
    return {"notes": notes, "chords": chords, "tempo": mm[0].getQuarterBPM() if mm else None, "timeSignature": [ts[0].numerator, ts[0].denominator] if ts else [4, 4], "warnings": warnings}


def abc_pitch(pitch):
    names = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"]
    name = names[pitch % 12]
    octave = pitch // 12 - 1
    if octave >= 5:
        return name.lower() + "'" * (octave - 5)
    return name + "," * (4 - octave)


def length(beats):
    f = Fraction(beats).limit_denominator(192)
    return str(f.numerator) if f.denominator == 1 else f"{f.numerator}/{f.denominator}"


def write_abc(notes, chords, tempo=120, signature=(4, 4), title="Composition"):
    """Encode polyphony as independent monophonic voices, preserving all start/duration pairs."""
    ns = sorted([Note.model_validate(n) for n in notes], key=lambda n: (n.beat, n.pitch))
    cs = [Chord.model_validate(c) for c in chords]
    if not ns:
        raise ValueError("Add melody notes before exporting a score")
    voices: list[list] = []
    for n in ns:
        voice = next((v for v in voices if v[-1].beat + v[-1].duration <= n.beat + 1e-7), None)
        if voice is None:
            voice = []
            voices.append(voice)
        voice.append(n)
    clean = re.sub(r"[\r\n]", " ", title)[:100]
    out = ["X:1", f"T:{clean}", f"M:{signature[0]}/{signature[1]}", "L:1/4", f"Q:1/4={round(tempo)}", "K:C", "%%propagate-accidentals not"]
    for i, voice in enumerate(voices):
        out.append(f"V:{i+1}")
        tokens, cursor = [], 0.
        for n in voice:
            if n.beat > cursor + 1e-7:
                tokens.append("z" + length(n.beat-cursor))
            if i == 0:
                for c in cs:
                    if abs(c.beat - n.beat) < 1e-6:
                        tokens.append('"' + re.sub(r'["\r\n]', '', c.symbol) + '"')
            pitch = abc_pitch(n.pitch)
            if "^" not in pitch:
                pitch = "=" + pitch
            tokens.append(pitch + length(n.duration))
            cursor = n.beat + n.duration
        out.append(" ".join(tokens) + " |]")
    missing = [c for c in cs if not any(abs(n.beat-c.beat) < 1e-6 for n in voices[0])]
    if missing:
        # Harmony voice supplies chord changes during held notes/rests.
        out.append('V:harmony name="Harmony"')
        cursor, tokens = 0., []
        for c in sorted(missing, key=lambda c: c.beat):
            if c.beat > cursor:
                tokens.append('z' + length(c.beat-cursor))
            tokens.append('"' + re.sub(r'["\r\n]', '', c.symbol) + '"z' + length(c.duration))
            cursor = c.beat + c.duration
        out.append(" ".join(tokens) + " |]")
    return "\n".join(out) + "\n"


def read_midi(data):
    midi = mido.MidiFile(file=io.BytesIO(data))
    if midi.type == 2:
        raise ValueError("MIDI type 2 contains independent sequences. Export a synchronized type 0 or 1 file first.")
    if midi.ticks_per_beat <= 0:
        raise ValueError("SMPTE MIDI timing is not supported. Export with ticks per quarter note.")
    families = ("Piano", "Chromatic percussion", "Organ", "Guitar", "Bass", "Strings", "Ensemble", "Brass", "Reed", "Pipe", "Synth lead", "Synth pad", "Synth effects", "World", "Percussive", "Sound effects")
    tracks, tempos, meters = [], [], []
    controllers, programs_changed, unfinished = False, False, False
    for index, track in enumerate(midi.tracks):
        tick, active, parts, name = 0, {}, {}, ""
        programs = {}
        def part(channel):
            return parts.setdefault(channel, {"notes": [], "program": programs.get(channel, 0)})
        def finish(channel, pitch, start, end, velocity):
            part(channel)["notes"].append(Note(beat=start/midi.ticks_per_beat, duration=max(1, end-start)/midi.ticks_per_beat, pitch=pitch, velocity=velocity, channel=channel).model_dump())
        for event in track:
            tick += event.time
            if event.type == "track_name":
                name = event.name
            elif event.type == "set_tempo":
                tempos.append((tick, event.tempo))
            elif event.type == "time_signature":
                meters.append((tick, event.numerator, event.denominator))
            elif event.type == "program_change":
                if event.channel in parts and event.program != parts[event.channel]["program"]:
                    programs_changed = True
                programs[event.channel] = event.program
            elif event.type in ("control_change", "pitchwheel", "aftertouch", "polytouch"):
                controllers = True
            elif event.type == "note_on" and event.velocity > 0:
                part(event.channel)
                active.setdefault((event.channel, event.note), []).append((tick, event.velocity))
            elif event.type in ("note_off", "note_on"):
                pending = active.get((event.channel, event.note), [])
                if pending:
                    start, velocity = pending.pop(0)
                    finish(event.channel, event.note, start, tick, velocity)
        for (channel, pitch), pending in active.items():
            for start, velocity in pending:
                unfinished = True
                finish(channel, pitch, start, tick, velocity)
        for channel, info in sorted(parts.items()):
            program, notes = info["program"], info["notes"]
            if not notes:
                continue
            percussion = channel == 9
            patch = "Drum kit" if percussion else f"{families[program // 8]} (GM {program + 1})"
            preview = "drums" if percussion else "bass" if 32 <= program <= 39 else "pad" if 48 <= program <= 55 or 88 <= program <= 103 else "poly" if 80 <= program <= 87 else "piano"
            tracks.append({"name": f"{(name or f'Track {index+1}')[:110]} · Ch {channel+1} · {patch}", "notes": sorted(notes, key=lambda n: (n["beat"], n["pitch"])), "channel": channel, "program": program, "instrument": preview})
    tempo = next((value for tick, value in reversed(sorted(tempos, key=lambda event: event[0])) if tick == 0), 500000)
    signature = next(([n, d] for tick, n, d in reversed(sorted(meters, key=lambda event: event[0])) if tick == 0), [4, 4])
    warnings = ["Studio uses simple preview instruments, not the file's original General MIDI sound bank."]
    if any(tick > 0 and value != tempo for tick, value in tempos):
        warnings.append("Tempo changes are not imported. Notes keep their quarter-beat positions at one project tempo.")
    if any(tick > 0 and [n, d] != signature for tick, n, d in meters):
        warnings.append("Time-signature changes are not imported; only the opening meter is available.")
    if controllers:
        warnings.append("Sustain, expression, pitch bends and other controller events are not imported.")
    if programs_changed:
        warnings.append("Instrument changes within a part are not reproduced by Studio preview instruments.")
    if unfinished:
        warnings.append("Notes without a note-off end at their source track's final event.")
    return {"tracks": tracks, "tempo": mido.tempo2bpm(tempo), "timeSignature": signature, "warnings": warnings}


def write_midi(notes, tempo=120, signature=(4, 4)):
    midi = mido.MidiFile(ticks_per_beat=960)
    track = mido.MidiTrack()
    midi.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(tempo)))
    track.append(mido.MetaMessage("time_signature", numerator=signature[0], denominator=signature[1]))
    events = []
    for n in [Note.model_validate(n) for n in notes]:
        events += [(round(n.beat*960), 1, mido.Message("note_on", channel=n.channel, note=n.pitch, velocity=n.velocity)), (round((n.beat+n.duration)*960), 0, mido.Message("note_off", channel=n.channel, note=n.pitch, velocity=0))]
    last = 0
    for tick, _, message in sorted(events, key=lambda e: (e[0], e[1])):
        message.time = tick - last
        track.append(message)
        last = tick
    data = io.BytesIO()
    midi.save(file=data)
    return data.getvalue()
