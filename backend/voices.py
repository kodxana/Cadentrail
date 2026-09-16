"""Conservative speaker assignment; uncertain or changing roles stay unassigned."""
import re
from .visual_schema import LyricVoice

LABELS={'a':'a','voicea':'a','voice1':'a','singera':'a','male':'a','b':'b','voiceb':'b','voice2':'b','singerb':'b','female':'b','c':'c','voicec':'c','voice3':'c','d':'d','voiced':'d','voice4':'d','both':'together','together':'together','duet':'together'}
def voice_label(value):return LABELS.get(re.sub(r'[\s_.-]','',value.casefold()))
def heading_voice(value):
    return next((v for part in reversed(re.split(r'[:|/—–-]',value)) if (v:=voice_label(part.strip()))),None)
def line_voice(text):
    match=re.match(r'^\[([^\]]+)\]\s*(.+)$',text)
    if match and (voice:=voice_label(match[1])):return match[2],voice
    match=re.match(r'^(Voice [ABCD1-4]|Singer [AB]|Male|Female|Together|Both|[ABCD]):\s*(.+)$',text,re.I)
    if match:return match[2],voice_label(match[1])
    return text,None

def probability_segments(probabilities,duration,frame_step=.08,threshold=.65):
    import numpy as np
    p=np.asarray(probabilities,dtype=float)
    while p.ndim>2 and p.shape[0]==1:p=p[0]
    if p.ndim!=2 or p.shape[1]!=4:raise ValueError('Speaker detector returned an unexpected shape')
    if not np.isfinite(p).all():raise ValueError('Speaker detector returned invalid probabilities')
    if frame_step<=0 or duration<=0:raise ValueError('Voice analysis needs a positive duration and frame interval')
    result=[]
    for speaker in range(4):
        start=None
        for i in range(min(len(p),int(np.ceil(duration/frame_step)))+1):
            active=i<len(p) and i*frame_step<duration and p[i,speaker]>=threshold
            if active and start is None:start=i
            if not active and start is not None:
                end=min(duration,i*frame_step)
                if end-start*frame_step>=.24:
                    result.append({'start':round(start*frame_step,4),'end':round(end,4),'speaker':speaker,'confidence':float(p[start:i,speaker].mean())})
                start=None
    return sorted(result,key=lambda x:(x['start'],x['speaker']))

def overlap(a,b):return max(0,min(a['end'],b['end'])-max(a['start'],b['start']))

def assign_voices(timing,segments,max_voices=2):
    durations={}
    for segment in segments:durations[segment['speaker']]=durations.get(segment['speaker'],0)+segment['end']-segment['start']
    selected=set(sorted(durations,key=durations.get,reverse=True)[:max_voices])
    order=list(dict.fromkeys(s['speaker'] for s in segments if s['speaker'] in selected))
    mapping={speaker:'abcd'[i] for i,speaker in enumerate(order)}
    timing.voices=[LyricVoice(id=v,name='Voice '+v.upper()) for v in mapping.values()]
    timing.speakerModel='nvidia/diar_streaming_sortformer_4spk-v2.1'
    for line in timing.lines:
        if line.voiceSource in ('manual','lyrics'):continue
        spans=[{'start':w.start,'end':w.end} for w in line.words if w.start is not None]
        if not spans and line.start is not None:spans=[{'start':line.start,'end':line.end}]
        total=sum(s['end']-s['start'] for s in spans)
        if not total:continue
        scores={};prob={}
        for speaker in order:
            hits=[(overlap(span,segment),segment['confidence']) for span in spans for segment in segments if segment['speaker']==speaker]
            seconds=sum(n for n,c in hits);scores[speaker]=min(1,seconds/total)
            prob[speaker]=sum(n*c for n,c in hits)/seconds if seconds else 0
        ranked=sorted(scores,key=scores.get,reverse=True)
        if not ranked:continue
        first=ranked[0];second=ranked[1] if len(ranked)>1 else None
        concurrent=0
        if second is not None:
            for a in segments:
                if a['speaker']!=first:continue
                for b in segments:
                    if b['speaker']!=second:continue
                    pair={'start':max(a['start'],b['start']),'end':min(a['end'],b['end'])}
                    concurrent+=sum(overlap(span,pair) for span in spans)
        if second is not None and scores[first]>=.55 and scores[second]>=.55 and concurrent/total>=.3:
            line.voice='together';line.voiceConfidence=min(prob[first],prob[second]);line.voiceSource='detected'
        elif scores[first]>=.65 and (second is None or scores[second]<.25):
            line.voice=mapping[first];line.voiceConfidence=prob[first];line.voiceSource='detected'
    if any(l.voiceSource=='detected' for l in timing.lines):timing.warnings.append('Automatic voice assignments need review, especially layered vocals and harmonies.')
    else:timing.warnings.append('No reliable voice assignments were found. Assign voices manually in the timing editor.')
    return timing
