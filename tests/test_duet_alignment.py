import numpy as np
import pytest
from backend.alignment import match_lyrics,lyric_lines
from backend.voices import assign_voices,probability_segments
from backend.visual_schema import LyricTiming,LyricLine,LyricVoice
from backend.gpu import parse_gpu_csv
from backend.model_runtime import alignment_models

def test_measured_alignment_has_no_invented_probability_or_missing_timestamps():
    words=[{'text':w,'start':i,'end':i+.8} for i,w in enumerate('we keep a light'.split())]
    timing=match_lyrics('[Voice A]\nwe keep a light\n[Voice B]\nmissing words',words,'asset',forced=True)
    assert timing.coverage==pytest.approx(4/6)
    assert timing.lines[0].voice=='a' and timing.lines[1].voice=='b'
    assert timing.lines[0].source=='forced-alignment'
    assert all(w.confidence is None for w in timing.lines[0].words)
    assert all(w.start is None for w in timing.lines[1].words)
    LyricTiming.model_validate(timing.model_dump())

def test_role_markup_and_plain_words_remain_distinct():
    lines=lyric_lines('[Verse - Male]\nI am here\nFemale: Are you there\n[Chorus]\nBoth: Carry me home\nA beautiful day')
    assert [l.voice for l in lines]==['a','b','together',None]
    assert lines[-1].text=='A beautiful day'

def test_voice_activity_assigns_in_order_and_identifies_simultaneous_vocals():
    p=np.zeros((100,4));p[:35,2]=.95;p[35:70,0]=.93;p[70:,0]=.96;p[70:,2]=.94
    segments=probability_segments(p,8)
    timing=LyricTiming(lines=[LyricLine(text='A',start=.5,end=2),LyricLine(text='B',start=3,end=5),LyricLine(text='Both',start=6,end=7.8)])
    assign_voices(timing,segments)
    assert [l.voice for l in timing.lines]==['a','b','together']
    assert all(l.voiceSource=='detected' for l in timing.lines)
    assert timing.lines[0].voiceConfidence==pytest.approx(.95)

def test_ambiguous_voice_switches_stay_unassigned_and_manual_roles_survive():
    segments=[dict(start=0,end=2,speaker=0,confidence=.9),dict(start=2,end=4,speaker=1,confidence=.9)]
    timing=LyricTiming(lines=[LyricLine(text='ambiguous',start=0,end=4),LyricLine(text='manual',start=0,end=1,voice='b',voiceSource='manual'),LyricLine(text='cleared',start=2,end=3,voiceSource='manual')])
    assign_voices(timing,segments)
    assert [l.voice for l in timing.lines]==[None,'b',None]
    assert timing.lines[1].voiceSource=='manual'

def test_old_timing_schema_defaults_do_not_change_line_content():
    t=LyricTiming.model_validate({'lines':[{'text':'hello world','start':1,'end':2}]})
    assert t.lines[0].voice is None and t.voices==[] and t.lines[0].start==1
    with pytest.raises(ValueError):LyricTiming(voices=[LyricVoice(id='a',name='One'),LyricVoice(id='a',name='Two')])

def test_gpu_samples_are_real_mib_and_missing_is_not_zero():
    devices=parse_gpu_csv('"NVIDIA, test", 1024, 24564, 90, 68, 0\nNVIDIA other, 0, 24564, N/A, N/A, 1\nBad, N/A, 24564, 0, 20, 2\nBad, NaN, 24564, 0, 20, 3')
    assert len(devices)==2 and devices[0]['usedBytes']==2**30
    assert devices[1]['usedBytes']==0 and devices[1]['utilization'] is None
    assert devices[1]['temperature'] is None

def test_alignment_models_are_optional_and_legacy_remains_selectable():
    assert alignment_models({})==['qwen-asr','qwen-aligner','whisper','sortformer']
    assert alignment_models({'isolateVocals':True})==['qwen-asr','qwen-aligner','whisper','sortformer','demucs']
    assert alignment_models({'backend':'whisper'})==['whisper']
    assert alignment_models({'detectVoices':False,'isolateVocals':False})==['qwen-asr','qwen-aligner','whisper']

def test_rendered_duet_lines_use_opposite_sides():
    from PIL import Image
    from backend.visual_render import draw_lyrics
    from backend.visual_schema import VideoDesign
    bounds=[]
    for voice in ['a','b']:
        image=Image.new('RGB',(640,360),'black')
        draw_lyrics(image,LyricTiming(lines=[LyricLine(text='Come home',start=0,end=2,voice=voice)]),1,VideoDesign(fontSize=60,lyricY=.3))
        bounds.append(image.getbbox())
    assert bounds[0][0]<bounds[1][0] and bounds[0][2]<bounds[1][2]

def test_automatic_video_accepts_only_reviewed_distinct_voice_overlaps():
    from backend.auto_video import confident_timing
    t=LyricTiming(assetId='a',sourceLyrics='Duet',needsReview=False,lines=[LyricLine(text='one',start=1,end=3,voice='a'),LyricLine(text='two',start=2,end=4,voice='b')])
    assert confident_timing(t,'a','Duet')
    t.lines[1].voice=None
    assert not confident_timing(t,'a','Duet')
    t.lines[1].voice='b';t.needsReview=True
    assert not confident_timing(t,'a','Duet')

def test_ordered_matching_does_not_skip_a_verse_to_match_a_later_chorus():
    lyrics='we keep a light on the water\nfirst verse at sea\nwe keep a light on the water\nsecond verse at home'
    heard='we keep light on water first verse at sea we keep a light on the water second verse at home'.split()
    t=match_lyrics(lyrics,[{'text':w,'start':i,'end':i+.8} for i,w in enumerate(heard)],'a',forced=True)
    assert t.lines[1].start==5 and t.lines[2].start==9 and t.lines[3].start==16
    assert t.lines[0].words[0].start==0

def test_hybrid_keeps_measured_words_and_fills_only_from_another_recognizer():
    from backend.alignment import combine_alignments
    lyrics='hold the light\nwe are home'
    a=match_lyrics(lyrics,[{'text':w,'start':i+1,'end':i+1.8} for i,w in enumerate('hold light we are home'.split())],'a',forced=True)
    b=match_lyrics(lyrics,[{'text':w,'start':i*.8,'end':i*.8+.7,'probability':.9} for i,w in enumerate(lyrics.split())],'a')
    result=combine_alignments(a,b)
    assert result.lines[0].source=='transcription-match'
    assert result.lines[1].source=='forced-alignment'
    assert result.coverage==1 and result.needsReview
    LyricTiming.model_validate(result.model_dump())

def test_measured_line_boundaries_do_not_require_fabricating_an_interior_word():
    words=[{'text':w,'start':i,'end':i+.8} for i,w in enumerate('we keep light on the water'.split())]
    t=match_lyrics('we keep a light on the water',words,'a',forced=True)
    assert t.lines[0].start==0 and t.lines[0].end==5.8
    assert t.lines[0].words[2].start is None and t.lines[0].words[2].end is None
    LyricTiming.model_validate(t.model_dump())

def test_validated_alignment_options_and_dependency_prompt_agree():
    from backend.visual_api import AlignOptions
    for options in ({},{'backend':'whisper'},{'isolateVocals':True},{'detectVoices':False}):
        validated=AlignOptions.model_validate({'lyrics':'A song',**options}).model_dump()
        assert alignment_models(options)==alignment_models(validated)
