"""Project-linked visual composition; seconds are independent of the musical grid."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
import uuid

def uid(): return uuid.uuid4().hex

class VisualModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class TimedWord(VisualModel):
    id: str = Field(default_factory=uid)
    text: str = Field('', max_length=200)
    start: float | None = Field(None, ge=0, le=86400)
    end: float | None = Field(None, ge=0, le=86400)
    confidence: float | None = Field(None, ge=0, le=1)
    source: Literal['manual', 'transcription-match', 'forced-alignment'] = 'manual'

    @model_validator(mode='after')
    def interval(self):
        if (self.start is None) != (self.end is None) or (self.start is not None and self.end <= self.start):
            raise ValueError('Timing needs both start and end, with end after start')
        return self

class LyricLine(TimedWord):
    text: str = Field('', max_length=2000)
    words: list[TimedWord] = Field(default_factory=list, max_length=300)
    section: str = Field('', max_length=120)
    voice: Literal['a','b','c','d','together'] | None = Field(None,json_schema_extra={'clientOptional':True})
    voiceSource: Literal['manual','lyrics','detected'] | None = Field(None,json_schema_extra={'clientOptional':True})
    voiceConfidence: float | None = Field(None,ge=0,le=1,json_schema_extra={'clientOptional':True})

    @model_validator(mode='after')
    def words_within_line(self):
        timed = [w for w in self.words if w.start is not None]
        if self.start is not None and any(w.start < self.start-.02 or w.end > self.end+.02 for w in timed):
            raise ValueError('Word times must fit inside the line')
        if any(a.end > b.start+.02 for a,b in zip(timed, timed[1:])):
            raise ValueError('Word times cannot overlap')
        return self

class LyricVoice(VisualModel):
    id: Literal['a','b','c','d']
    name: str = Field(max_length=60)

class LyricTiming(VisualModel):
    assetId: str | None = None
    sourceLyrics: str = Field('', max_length=30000)
    language: str = Field('auto', max_length=20)
    model: str | None = None
    jobId: str | None = None
    coverage: float | None = Field(None, ge=0, le=1)
    needsReview: bool = True
    lines: list[LyricLine] = Field(default_factory=list, max_length=2000)
    voices: list[LyricVoice] = Field(default_factory=list,max_length=4,json_schema_extra={'clientOptional':True})
    speakerModel: str | None = Field(None,max_length=300,json_schema_extra={'clientOptional':True})
    warnings: list[str] = Field(default_factory=list,max_length=20,json_schema_extra={'clientOptional':True})

    @model_validator(mode='after')
    def unique_voices(self):
        if len({v.id for v in self.voices}) != len(self.voices):raise ValueError('Voice identifiers must be unique')
        return self

class VisualAsset(VisualModel):
    id: str = Field(default_factory=uid, pattern=r'^[a-f0-9]{32}$')
    name: str = Field('Artwork', max_length=180)
    kind: Literal['image','cover','video'] = 'image'
    path: str
    width: int = Field(1024, ge=1, le=16384)
    height: int = Field(1024, ge=1, le=16384)
    duration: float | None = Field(None, ge=0, le=86400)
    createdAt: float = 0
    prompt: str = Field('', max_length=12000)
    negativePrompt: str = Field('', max_length=4000)
    model: str = Field('uploaded', max_length=300)
    seed: int | None = None
    jobId: str | None = None
    sourceAssetId: str | None = None
    candidateId: str | None = None
    parentId: str | None = None
    settings: dict = Field(default_factory=dict)

    @model_validator(mode='after')
    def safe_path(self):
        from pathlib import PurePosixPath
        p=PurePosixPath(self.path)
        if p.is_absolute() or '..' in p.parts or '\\' in self.path or ':' in self.path or not p.parts or p.parts[0]!='visuals':
            raise ValueError('Visual assets must stay in the project visuals directory')
        return self

class CoverDesign(VisualModel):
    backgroundId: str | None = None
    title: str = Field('', max_length=180)
    artist: str = Field('', max_length=180)
    subtitle: str = Field('', max_length=240)
    font: Literal['sans','serif','mono'] = 'sans'
    align: Literal['left','center','right'] = 'left'
    size: int = Field(80, ge=20, le=240)
    tracking: int = Field(0, ge=-5, le=25)
    color: str = Field('#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    background: str = Field('#202329', pattern=r'^#[0-9a-fA-F]{6}$')
    overlay: float = Field(.25, ge=0, le=.9)
    scale: float = Field(1, ge=1, le=5)
    x: float = Field(.5, ge=0, le=1)
    y: float = Field(.5, ge=0, le=1)
    textY: float = Field(.72, ge=.05, le=.92)
    stroke: int = Field(0, ge=0, le=6)
    shadow: bool = True

class VideoScene(VisualModel):
    id: str = Field(default_factory=uid)
    type: Literal['image','video','color','text','lyrics','waveform','spectrum','title'] = 'image'
    start: float = Field(0, ge=0, le=1200)
    end: float = Field(30, gt=0, le=1200)
    assetId: str | None = None
    text: str = Field('', max_length=1000)
    color: str = Field('#202329', pattern=r'^#[0-9a-fA-F]{6}$')
    opacity: float = Field(1, ge=0, le=1)
    x: float = Field(.5, ge=0, le=1)
    y: float = Field(.5, ge=0, le=1)
    size: float = Field(.8, ge=.05, le=1)
    motion: Literal['still','zoom','pan'] = 'still'
    fade: float = Field(.5, ge=0, le=5)
    @model_validator(mode='after')
    def interval(self):
        if self.end <= self.start: raise ValueError('Scene end must follow start')
        return self

class VideoDesign(VisualModel):
    preview: bool = False
    audioAssetId: str | None = None
    backgroundId: str | None = None
    kind: Literal['karaoke','lyric','visualizer'] = 'karaoke'
    template: Literal['clean','classic','cinematic','minimal','visualizer'] = 'clean'
    preset: Literal['1080p','1080p60','1440p','4k','vertical','square'] = '1080p'
    duration: float | None = Field(None, gt=0, le=1200)
    start: float = Field(0, ge=0, le=1200)
    font: Literal['sans','serif','mono'] = 'sans'
    fontSize: int = Field(58, ge=20, le=160)
    lyricY: float = Field(.76, ge=.15, le=.9)
    color: str = Field('#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    highlight: str = Field('#f1b766', pattern=r'^#[0-9a-fA-F]{6}$')
    background: str = Field('#14171d', pattern=r'^#[0-9a-fA-F]{6}$')
    visualizer: Literal['none','waveform','mirrored','bars','circle','scope','particles'] = 'waveform'
    sensitivity: float = Field(1, ge=.1, le=3)
    smoothing: float = Field(.7, ge=0, le=.95)
    thickness: int = Field(3, ge=1, le=12)
    opacity: float = Field(.75, ge=0, le=1)
    visualizerY: float = Field(.5, ge=.1, le=.9)
    visualizerX: float = Field(.5, ge=0, le=1)
    visualizerSize: float = Field(.8, ge=.1, le=1)
    motion: Literal['still','zoom','pan'] = 'zoom'
    beatPulse: bool = False
    intro: bool = True
    encoder: Literal['h264','hevc','av1','webm','archive'] = 'h264'
    crf: int = Field(18, ge=12, le=30)
    scenes: list[VideoScene] = Field(default_factory=list, max_length=100)

class ArtworkDesign(VisualModel):
    prompt: str = Field('', max_length=12000)
    negativePrompt: str = Field('text, letters, watermark, signature, blurry', max_length=4000)
    aspect: Literal['1:1','16:9','9:16','4:5'] = '1:1'
    count: Literal[1,2,4] = 1
    seed: int = Field(831001,ge=0,le=2**53-9)
    style: str = Field('Editorial illustration',max_length=200)
    mood: str = Field('',max_length=200)
    characters: Literal['none','suggested'] = 'none'
    environment: str = Field('',max_length=300)
    colors: str = Field('',max_length=200)
    composition: str = Field('Strong focal point, space for title',max_length=300)
    steps: int = Field(30,ge=15,le=50)

class Visuals(VisualModel):
    artwork: ArtworkDesign = Field(default_factory=ArtworkDesign)
    assets: list[VisualAsset] = Field(default_factory=list, max_length=2000)
    coverId: str | None = None
    cover: CoverDesign = Field(default_factory=CoverDesign)
    timing: LyricTiming = Field(default_factory=LyricTiming)
    video: VideoDesign = Field(default_factory=VideoDesign)
    timingHistory: list[LyricTiming] = Field(default_factory=list, max_length=50)

class LyricDraft(VisualModel):
    language: str | None = Field(None,max_length=12,json_schema_extra={'clientOptional':True})
    languageConfidence: float | None = Field(None,ge=0,le=1,json_schema_extra={'clientOptional':True})
    id: str = Field(default_factory=uid)
    createdAt: float = 0
    jobId: str | None = None
    text: str = Field('', max_length=30000)
    model: str = ''
    operation: str = 'generate'
    seed: int = 831001

class Creative(VisualModel):
    assistanceLanguage: str = Field('auto',pattern=r'^(auto|en|ja|ko|zh|es|fr|de|it|pt|pl|ru|uk|hi|ar|tr|id|th|vi)$',json_schema_extra={'clientOptional':True})
    assistanceModel: str | None = Field(None,max_length=200)
    candidates: Literal[1,2,4,8] = 2
    selectedCandidateId: str | None = None
    parentId: str | None = None
    quality: Literal['fast','balanced','high','maximum','custom'] = 'balanced'
    lyricDrafts: list[LyricDraft] = Field(default_factory=list, max_length=100)
