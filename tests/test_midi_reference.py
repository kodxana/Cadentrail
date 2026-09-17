import io

import mido
import pytest

from backend import score
from backend.music_adapters import generation_kwargs
from backend.schema import Generation


def midi_bytes(tracks, kind=1):
    midi = mido.MidiFile(type=kind, ticks_per_beat=120)
    midi.tracks.extend(mido.MidiTrack(t) for t in tracks)
    data = io.BytesIO()
    midi.save(file=data)
    return data.getvalue()


def test_type_zero_splits_parts_and_preserves_opening_timing_and_all_notes():
    data = midi_bytes([[
        mido.MetaMessage("set_tempo", tempo=300000),
        mido.MetaMessage("time_signature", numerator=6, denominator=8),
        mido.Message("program_change", channel=3, program=80),
        mido.Message("note_on", channel=3, note=72, velocity=99),
        mido.Message("note_on", channel=9, note=36, velocity=70),
        mido.Message("note_off", channel=9, note=36, time=30),
        mido.Message("control_change", channel=3, control=11, value=85),
        mido.Message("note_off", channel=3, note=72, time=90),
        mido.MetaMessage("set_tempo", tempo=600000),
        mido.Message("note_on", channel=3, note=74, velocity=81),
        mido.Message("note_off", channel=3, note=74, time=120),
    ]], kind=0)
    result = score.read_midi(data)
    assert result["tempo"] == 200
    assert result["timeSignature"] == [6, 8]
    lead, drums = result["tracks"]
    assert lead["channel"] == 3 and lead["program"] == 80
    assert "Ch 4" in lead["name"] and "GM 81" in lead["name"]
    assert lead["instrument"] == "poly" and drums["instrument"] == "drums"
    assert [(n["pitch"], n["beat"], n["duration"], n["velocity"]) for n in lead["notes"]] == [(72, 0, 1, 99), (74, 1, 1, 81)]
    assert len(drums["notes"]) == 1 and drums["notes"][0]["duration"] == .25
    assert any("Tempo changes" in w for w in result["warnings"])
    assert any("controller" in w for w in result["warnings"])


def test_later_tempo_does_not_replace_default_opening_tempo_and_hanging_notes_survive():
    result = score.read_midi(midi_bytes([[
        mido.Message("note_on", note=60, velocity=80),
        mido.MetaMessage("set_tempo", tempo=300000, time=120),
        mido.MetaMessage("end_of_track", time=120),
    ]]))
    assert result["tempo"] == 120
    assert result["tracks"][0]["notes"][0]["duration"] == 2
    assert any("note-off" in w for w in result["warnings"])


def test_independent_midi_sequences_are_rejected():
    with pytest.raises(ValueError, match="independent sequences"):
        score.read_midi(midi_bytes([[]], kind=2))


def test_selected_midi_melody_reaches_model_kwargs_without_other_parts_or_chords():
    notes = [{"pitch": p, "beat": i, "duration": .5, "channel": 3, "velocity": 90} for i, p in enumerate([72, 70, 67, 74])]
    result = score.read_midi(score.write_midi(notes + [{"pitch": 36, "beat": 0, "duration": 4, "channel": 9}], 200))
    lead = next(t for t in result["tracks"] if t["channel"] == 3)
    abc = score.write_abc(lead["notes"], [], result["tempo"], result["timeSignature"])
    request = generation_kwargs(Generation(style="Piano instrumental", role="instrumental", abc=abc, useScore=True, cot="melody").model_dump(), 42)
    assert request["abc"] == abc and request["cot"] == "melody"
    parsed = score.parse_abc(request["abc"])
    assert parsed["tempo"] == 200
    assert not parsed["chords"]
    assert [(n["pitch"], n["beat"], n["duration"]) for n in parsed["notes"]] == [(n["pitch"], n["beat"], n["duration"]) for n in notes]
