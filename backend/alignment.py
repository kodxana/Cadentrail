"""Conservative lyric matching: unknown timings stay null, never interpolated."""
import re, unicodedata
from collections import namedtuple
from .visual_schema import LyricLine, TimedWord, LyricTiming

def normalize(word):
    return ''.join(c for c in unicodedata.normalize('NFKC',word).casefold() if c.isalnum())

def lyric_lines(lyrics):
    from .voices import heading_voice,line_voice
    result=[];section='';voice=None
    for raw in lyrics.splitlines():
        text=raw.strip()
        if not text:continue
        if re.fullmatch(r'\[[^\]]+\]',text):
            section=text[1:-1];voice=heading_voice(section);continue
        text,inline=line_voice(text);role=inline or voice
        result.append(LyricLine(text=text,section=section,voice=role,voiceSource='lyrics' if role else None,words=[TimedWord(text=w) for w in text.split()]))
    return result

Match=namedtuple('Match','a b size')
def ordered_matches(expected,heard):
    """Minimum-edit alignment preserves verse order across repeated choruses.

    Traceback uses one byte per cell; no guessed word times or fuzzy substitutions
    become matches. A mismatched token can still anchor surrounding exact words.
    """
    n,m=len(expected),len(heard)
    if n*m>36_000_000:raise ValueError('Lyrics are too long to align in one job. Split the recording into shorter takes.')
    directions=bytearray((n+1)*(m+1));previous=list(range(m+1))
    for i,a in enumerate(expected,1):
        row=[i]+[0]*m
        for j,b in enumerate(heard,1):
            diagonal=previous[j-1]+(a!=b);up=previous[j]+1;left=row[j-1]+1
            best=min(diagonal,up,left);row[j]=best
            directions[i*(m+1)+j]=0 if best==diagonal else 1 if best==up else 2
        previous=row
    pairs=[];i,j=n,m
    while i and j:
        direction=directions[i*(m+1)+j]
        if direction==0:
            if expected[i-1]==heard[j-1]:pairs.append((i-1,j-1))
            i-=1;j-=1
        elif direction==1:i-=1
        else:j-=1
    blocks=[]
    for a,b in reversed(pairs):
        if blocks and a==blocks[-1].a+blocks[-1].size and b==blocks[-1].b+blocks[-1].size:
            prev=blocks[-1];blocks[-1]=Match(prev.a,prev.b,prev.size+1)
        else:blocks.append(Match(a,b,1))
    return blocks

def match_lyrics(lyrics, recognized, asset_id, language='auto', *, forced=False):
    lines=lyric_lines(lyrics);expected=[w for line in lines for w in line.words]
    heard=[w for w in recognized if normalize(w['text'])]
    matches=ordered_matches([normalize(w.text) for w in expected],[normalize(w['text']) for w in heard])
    total=0
    for block in matches:
        # Isolated repeated words are not enough evidence unless the whole lyric
        # itself is one word. Singing probabilities are not calibrated confidence.
        if block.size<2 and len(expected)>1:continue
        for i in range(block.size):
            w=expected[block.a+i];r=heard[block.b+i]
            if (not forced and r.get('probability',0)<.5) or not 0 <= r['start'] < r['end']:continue
            w.start,w.end,w.confidence,w.source=r['start'],r['end'],r.get('probability'), 'forced-alignment' if forced else 'transcription-match';total+=1
    for line in lines:
        # Remove any pathological overlapping word from the recognizer.
        previous=-1
        for w in line.words:
            if w.start is not None:
                if w.start < previous:
                    w.start=w.end=None;total-=1;line.start=line.end=None
                else:previous=w.end
        # A measured first and last word can bound a line even when an interior
        # word is uncertain. Interior word timestamps remain null.
        if line.words and line.words[0].start is not None and line.words[-1].end is not None:
            line.start,line.end,line.source=line.words[0].start,line.words[-1].end,'forced-alignment' if forced else 'transcription-match'
    return LyricTiming(assetId=asset_id,sourceLyrics=lyrics,language=language,model='Qwen/Qwen3-ASR-1.7B + Qwen/Qwen3-ForcedAligner-0.6B' if forced else 'faster-whisper/large-v3',coverage=total/max(1,len(expected)),needsReview=True,lines=lines)


def combine_alignments(primary,fallback):
    """Keep stronger whole-line evidence; never splice timestamps across takes."""
    if primary.assetId!=fallback.assetId or primary.sourceLyrics!=fallback.sourceLyrics:raise ValueError('Alignment sources must describe the same take and lyrics')
    if len(primary.lines)!=len(fallback.lines):raise ValueError('Alignment line counts differ')
    result=primary.model_copy(deep=True)
    for i,(a,b) in enumerate(zip(primary.lines,fallback.lines)):
        count=lambda line:sum(w.start is not None for w in line.words)
        candidate=[w for w in b.words if w.start is not None]
        previous=[w.end for l in result.lines[:i] for w in l.words if w.start is not None]
        following=[w.start for l in primary.lines[i+1:] for w in l.words if w.start is not None]
        fits=bool(candidate) and (not previous or candidate[0].start>=previous[-1]) and (not following or candidate[-1].end<=following[0])
        if fits and count(b)>count(a):result.lines[i]=b.model_copy(deep=True)
    words=[w for l in result.lines for w in l.words]
    result.coverage=sum(w.start is not None for w in words)/max(1,len(words))
    result.model='Qwen3-ASR + Qwen3-ForcedAligner / Whisper large-v3 cross-check'
    result.warnings.append('Hybrid alignment keeps the stronger matched lines from two recognizers. Review timing before export.')
    return result
