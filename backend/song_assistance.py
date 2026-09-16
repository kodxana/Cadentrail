"""Reviewed writing drafts with language intent shared with live Radio."""
import re
from .radio_language import ALIASES, LANGUAGES, resolve_language, language_direction, check_language, detector_factory, lyric_text

LYRIC_OPERATIONS = {'generate','rewrite','continue','rhyme'}

def named_language(text):
    if any(re.search(r'(?<!\w)(?:'+alias+r')(?!\w)',text,re.I) for alias in ALIASES.values()) or re.search(r'[\u3040-\u30ff\uac00-\ud7af\u3400-\u9fff]{2}',text):
        return resolve_language('auto',text)
    return None

def assistance_language(options):
    explicit=options.get('language','auto')
    if explicit!='auto':return explicit
    # A task-specific direction outranks the music prompt; both outrank old words.
    requested=named_language(options.get('direction','')) or named_language(options.get('style',''))
    if requested:return requested
    if options.get('operation') in {'rewrite','continue','rhyme'} and lyric_text(options.get('lyrics','')):
        detector=detector_factory().create();detector.append(lyric_text(options['lyrics']))
        try:
            scores=detector.get_probabilities()
            if scores and scores[0].prob>=.8:
                code=scores[0].lang.split('-')[0]
                if code in LANGUAGES:return code
        except Exception:
            pass
    return 'en'

def generate_draft(provider, options, progress):
    request=dict(options)
    operation=request.get('operation','generate')
    if operation not in LYRIC_OPERATIONS:return provider.generate(request,progress)
    if request.get('instrumental'):
        raise ValueError('Choose description or arrangement assistance for an instrumental, or enable vocals to write lyrics.')
    language=assistance_language(request)
    request['_lyricLanguage']=language_direction(language)
    for attempt in range(3):
        request['seed']=options.get('seed',831001)+attempt
        result=provider.generate(request,progress)
        try:
            verified=check_language(result['text'],language)
            return {**result,'language':language,'languageConfidence':verified['confidence']}
        except ValueError as exc:
            if attempt==2:raise ValueError('The assistant could not produce a reliably '+LANGUAGES[language]+' draft. Try another direction or assistance model; your saved writing is unchanged.') from exc
            progress('Generating','Checking '+LANGUAGES[language]+' lyrics; rewriting the language mismatch')
            request['direction']=options.get('direction','')+'\nCorrection: '+str(exc)+' '+request['_lyricLanguage']
