"""Explicit lyric language, description inference and offline draft verification."""
import re, unicodedata
from functools import lru_cache
from typing import Literal

RadioLanguage = Literal['auto','en','ja','ko','zh','es','fr','de','it','pt','pl','ru','uk','hi','ar','tr','id','th','vi']
LANGUAGES = {'auto':'From station description','en':'English','ja':'Japanese','ko':'Korean','zh':'Chinese','es':'Spanish','fr':'French','de':'German','it':'Italian','pt':'Portuguese','pl':'Polish','ru':'Russian','uk':'Ukrainian','hi':'Hindi','ar':'Arabic','tr':'Turkish','id':'Indonesian','th':'Thai','vi':'Vietnamese'}
ALIASES = {'en':r'english|英語','ja':r'japanese|日本語|j[ -]?(?:pop|rock)','ko':r'korean|한국어|k[ -]?pop','zh':r'chinese|mandarin|中文|普通话|国语','es':r'spanish|español','fr':r'french|français','de':r'german|deutsch','it':r'italian|italiano','pt':r'portuguese|português','pl':r'polish|polski|polsku','ru':r'russian|русский|русском','uk':r'ukrainian|українською|українська','hi':r'hindi|हिन्दी|हिंदी','ar':r'arabic|العربية','tr':r'turkish|türkçe','id':r'indonesian|bahasa indonesia','th':r'thai|ภาษาไทย','vi':r'vietnamese|tiếng việt'}
CJK = r'[\u3040-\u30ff\u3400-\u9fff\u0e00-\u0e7f]'


def lyric_text(lyrics):
    return re.sub(r'\[[^\]\n]*\]', '', lyrics).strip()


def lyric_units(lyrics):
    text=lyric_text(lyrics).casefold()
    # Space-free scripts need character shingles, rather than one enormous word
    # per line. Section labels do not count towards length or repetition.
    units=re.findall(r'[^\W_]+',re.sub(CJK,' ',text),flags=re.UNICODE)
    for chunk in re.findall(CJK+'+',text):
        units.extend(chunk[i:i+2] for i in range(max(1,len(chunk)-1)))
    return units


def resolve_language(language, description):
    if language != 'auto':return language
    text=description.casefold()
    # Explicit lyric/vocal wording outranks genre associations (English J-pop).
    for code,alias in ALIASES.items():
        if re.search(r'(?<!\w)(?:lyrics? (?:in|only in)|sung in|sing in|vocals? in)\s+(?:'+alias+r')(?!\w)|(?<!\w)(?:'+alias+r')\s+(?:lyrics?|vocals?|language)(?!\w)',text):return code
    found=[]
    for code,alias in ALIASES.items():
        m=re.search(r'(?<!\w)(?:'+alias+r')(?!\w)',text)
        if m:found.append((m.start(),code))
    if found:return min(found)[1]
    for code,pattern in [('ja',r'[\u3040-\u30ff]'),('ko',r'[\uac00-\ud7af]'),('zh',r'[\u3400-\u9fff]')]:
        if len(re.findall(pattern,text))>=2:return code
    return 'en'


def language_direction(code):
    script={'ja':'Use Japanese script (hiragana, katakana and kanji), not romaji.','ko':'Use Hangul, not romanization.','zh':'Use Chinese characters.','ru':'Use Cyrillic script.','uk':'Use Ukrainian Cyrillic script.','hi':'Use Devanagari.','ar':'Use Arabic script.','th':'Use Thai script.'}.get(code,'')
    return 'Required lyric language: '+LANGUAGES[code]+'. Write every sung line in '+LANGUAGES[code]+'. Do not add English hooks, translations or bilingual lines. '+script+' Keep the section labels [Verse], [Chorus], [Bridge], [Outro] in English; they are not sung.'


@lru_cache(maxsize=1)
def detector_factory():
    from langdetect import DetectorFactory
    from langdetect.detector_factory import PROFILES_DIRECTORY
    factory=DetectorFactory();factory.load_profile(PROFILES_DIRECTORY);factory.seed=0
    return factory


def check_language(lyrics, code):
    from langdetect.lang_detect_exception import LangDetectException
    text=lyric_text(lyrics)
    detector=detector_factory().create();detector.append(text)
    try:scores=detector.get_probabilities()
    except LangDetectException:raise ValueError('Could not verify the lyric language. Write complete '+LANGUAGES[code]+' lyrics.')
    match=sum(item.prob for item in scores if item.lang.split('-')[0]==code)
    if match<.80:raise ValueError('The draft is not reliably '+LANGUAGES[code]+'. Rewrite all sung lines in '+LANGUAGES[code]+'.')
    # Reject substantial foreign-language lines even if the overall detector
    # labels a mixed draft correctly. Tiny ad-libs are not reliable samples.
    foreign=[]
    for line in text.splitlines():
        letters=[c for c in line if c.isalpha()]
        latin=sum('LATIN' in unicodedata.name(c,'') for c in letters)
        if code in ('ja','ko','zh','ru','uk','hi','ar','th') and len(letters)>=12 and latin/max(1,len(letters))>.70:foreign.append(line)
    if foreign:raise ValueError('Remove the English or romanized lines. Use '+LANGUAGES[code]+' throughout.')
    return {'language':code,'confidence':round(match,4),'source':'langdetect-1.0.9','scope':'written lyrics'}
