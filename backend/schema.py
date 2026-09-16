"""Versioned musical project contract. Time is in quarter-note beats, assets in seconds."""
from __future__ import annotations
import time
import uuid
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator
from .visual_schema import Visuals, Creative


def uid() -> str:
    return uuid.uuid4().hex


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Note(Model):
    id: str = Field(default_factory=uid)
    beat: float = Field(0, ge=0)
    duration: float = Field(1, gt=0, le=4096)
    pitch: int = Field(60, ge=0, le=127)
    velocity: int = Field(96, ge=1, le=127)
    channel: int = Field(0, ge=0, le=15)


class Chord(Model):
    id: str = Field(default_factory=uid)
    beat: float = Field(0, ge=0)
    duration: float = Field(4, gt=0)
    symbol: str = Field("C", max_length=40)


class Point(Model):
    id: str = Field(default_factory=uid)
    beat: float = Field(0, ge=0)
    value: float


class Automation(Model):
    parameter: Literal["volume", "pan"] = "volume"
    points: list[Point] = Field(default_factory=list, max_length=10000)
    enabled: bool = True
    interpolation: Literal["linear", "step"] = "linear"

    @model_validator(mode="after")
    def check(self):
        low, high = (-1, 1) if self.parameter == "pan" else (0, 2)
        if any(not low <= p.value <= high for p in self.points):
            raise ValueError("Automation value outside parameter range")
        self.points.sort(key=lambda p: p.beat)
        if len({p.beat for p in self.points}) != len(self.points):
            raise ValueError("Automation points must have unique times")
        return self


class Effect(Model):
    id: str = Field(default_factory=uid)
    type: Literal["eq", "highpass", "lowpass", "compressor", "limiter", "delay", "reverb", "saturation", "width", "gain", "gate", "chorus"]
    bypass: bool = False
    params: dict[str, float] = Field(default_factory=dict)


class Clip(Model):
    id: str = Field(default_factory=uid)
    name: str = Field("Untitled clip", max_length=180)
    assetId: str | None = None
    beat: float = Field(0, ge=0, le=100000)
    duration: float = Field(16, gt=0, le=100000)
    offset: float = Field(0, ge=0)  # source seconds; notes are relative to clip
    gain: float = Field(1, ge=0, le=4)
    fadeIn: float = Field(0, ge=0)
    fadeOut: float = Field(0, ge=0)
    muted: bool = False
    reverse: bool = False
    color: str = "#66c8ae"
    notes: list[Note] = Field(default_factory=list, max_length=100000)
    loop: bool = False
    loopBeats: float = Field(16, gt=0)
    group: str | None = None
    generationId: str | None = None


class Track(Model):
    id: str = Field(default_factory=uid)
    name: str = Field("Audio", max_length=180)
    type: Literal["audio", "midi", "ai", "lyrics", "chord", "automation", "bus"] = "audio"
    color: str = "#66c8ae"
    volume: float = Field(0.8, ge=0, le=2)
    pan: float = Field(0, ge=-1, le=1)
    mute: bool = False
    solo: bool = False
    instrument: Literal["poly", "piano", "bass", "pad", "drums"] = "piano"
    clips: list[Clip] = Field(default_factory=list, max_length=10000)
    effects: list[Effect] = Field(default_factory=list, max_length=24)
    automation: list[Automation] = Field(default_factory=list, max_length=2)
    output: str = "master"


class Section(Model):
    id: str = Field(default_factory=uid)
    name: str = Field("Verse", max_length=120)
    beat: float = Field(0, ge=0)
    duration: float = Field(16, gt=0)
    lyrics: str = Field("", max_length=20000)


class HumSource(Model):
    assetId: str = Field(pattern=r'^[a-f0-9]{32}$')
    start: float = Field(0, ge=0, le=86400)
    duration: float = Field(15, ge=3, le=30)
    tempo: int = Field(120, ge=40, le=240)
    mode: Literal['continue', 'melody'] = 'continue'
    influence: float = Field(1, ge=0, le=2)


class Generation(Model):
    style: str = Field("", max_length=8000)
    lyrics: str = Field("", max_length=30000)
    cot: Literal["full", "melody", "off"] = "full"
    seed: int = Field(831001, ge=0, le=2**53-9)
    cfgScale: float | None = Field(None, ge=0, le=20)
    abc: str = Field("", max_length=100000)
    useScore: bool = False
    role: Literal["auto", "male", "female", "duet", "dialogue", "shared", "instrumental"] = "auto"
    musicAdapter: Literal['auto', 'base', 'instrumental-v1'] = 'auto'
    instrumentalSections: str = Field('[instrumental]', max_length=2000)
    hum: HumSource | None = None
    odeSteps: int = Field(32, ge=8, le=64)
    temperature: float = Field(1, ge=.3, le=1.5)
    topP: float = Field(.95, ge=.5, le=1)
    topK: int = Field(100, ge=10, le=200)


class Candidate(Model):
    id: str
    name: str
    assetId: str | None = None
    jobId: str
    seed: int
    abc: str = ""
    favorite: bool = False
    rank: int = Field(0, ge=0, le=5)
    parentId: str | None = None
    metadata: dict = Field(default_factory=dict)


class AudioEncoding(Model):
    id: str = Field(pattern=r'^[a-f0-9]{32}$')
    sourceAssetId: str
    resultAssetId: str | None = None
    name: str
    model: str
    revision: str
    mertRevision: str
    createdAt: float
    start: float
    duration: float
    tokens: int
    settings: dict = Field(default_factory=dict)


class Project(Model):
    schemaVersion: Literal[2] = 2
    artist: str = Field('', max_length=180)
    creative: Creative = Field(default_factory=Creative)
    visuals: Visuals = Field(default_factory=Visuals)
    audioEncodings: list[AudioEncoding] = Field(default_factory=list,max_length=1000)
    id: str = Field(default_factory=uid, pattern=r"^[a-f0-9]{32}$")
    name: str = Field("Untitled session", min_length=1, max_length=180)
    revision: int = Field(0, ge=0)
    createdAt: float = Field(default_factory=time.time)
    updatedAt: float = Field(default_factory=time.time)
    tempo: float = Field(120, ge=20, le=400)
    timeSignature: tuple[int, int] = (4, 4)
    key: str = "C major"
    tracks: list[Track] = Field(default_factory=list, max_length=256)
    chords: list[Chord] = Field(default_factory=list, max_length=10000)
    sections: list[Section] = Field(default_factory=list, max_length=10000)
    generation: Generation = Field(default_factory=Generation)
    candidates: list[Candidate] = Field(default_factory=list, max_length=1000)
    loopStart: float = Field(0, ge=0)
    loopEnd: float = Field(16, gt=0)
    masterVolume: float = Field(0.8, ge=0, le=2)
    tags: list[str] = Field(default_factory=list, max_length=40)
    favorite: bool = False
    archived: bool = False

    @model_validator(mode='before')
    @classmethod
    def migrate_v1(cls, value):
        if isinstance(value, dict) and value.get('schemaVersion', 1) == 1:
            value = {**value, 'schemaVersion': 2}
        return value

    @model_validator(mode="after")
    def valid_graph(self):
        if self.loopEnd <= self.loopStart:
            raise ValueError("Loop end must follow loop start")
        if not (1 <= self.timeSignature[0] <= 32 and self.timeSignature[1] in (2, 4, 8, 16)):
            raise ValueError("Invalid time signature")
        ids = [t.id for t in self.tracks] + [c.id for t in self.tracks for c in t.clips]
        if len(ids) != len(set(ids)):
            raise ValueError("Track and clip ids must be unique")
        tracks = {t.id: t for t in self.tracks}
        for t in self.tracks:
            seen = {t.id}
            out = t.output
            while out != "master":
                if out in seen or out not in tracks or tracks[out].type != "bus":
                    raise ValueError("Invalid or cyclic output routing")
                seen.add(out)
                out = tracks[out].output
        return self


class JobRequest(Model):
    projectId: str
    kind: Literal["generate", "plan", "separate", "export", "artwork", "lyrics", "align", "video", "cover", "master", "music-video", "tokenize", "backup", "model-download"] = "generate"
    candidates: Literal[1, 2, 4, 8] = 1
    generation: Generation | None = None
    assetId: str | None = None
    parentId: str | None = None
    options: dict = Field(default_factory=dict)
    approvedDownloads: list[str] = Field(default_factory=list,max_length=16)
