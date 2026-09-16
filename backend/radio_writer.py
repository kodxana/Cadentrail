"""Transient lyric writing using the same optional Qwen provider and consent rules."""
import contextlib, json, sys
from pathlib import Path
from .auxiliary import emit, QwenProvider
from .schema import JobRequest
from .model_runtime import prepare_models, model_path, required_models
from .radio import parse_song, LENGTH_DIRECTION, resolve_vocals
from .radio_language import resolve_language, language_direction, check_language


def main(task=None, provider=None):
    task=task or json.loads(sys.stdin.readline()); root=Path(task['root']); request=task['request']
    job=JobRequest(projectId='radio',kind='lyrics',options={'model':request['model']},approvedDownloads=request['approvedDownloads'])
    from .download_progress import install_download_progress
    install_download_progress(emit)
    prepare_models(root,None,job,emit)
    language=resolve_language(request.get('language','auto'),request['description'])
    vocals=resolve_vocals(request['vocals'],request['description'])
    direction=language_direction(language) if vocals!='instrumental' else 'Instrumental music only, without any sung vocals. Put a detailed UNSUNG arrangement outline of at least 24 words in the LYRICS field, using English section labels. The outline guides composition but is not sung.'
    options=dict(operation='radio',_longRadio=request.get('length','long')=='long',model=request['model'],seed=task['seed'],style=request['description'],
                 _lyricLanguage=direction,direction=direction+' Vocal direction: '+vocals+'. '+LENGTH_DIRECTION[request.get('length','long')]+' '+
                 'Choose a new specific story and title. Vary the imagery and arrangement within the requested genres. '+
                 'Do not repeat these recent songs: '+json.dumps([{'title':s['title'],'lyrics':s['lyrics'][:650]} for s in task['recent'][-6:]]),
                 _modelPath=str(model_path(root,required_models(root,None,job)[0])))
    def progress(state,message,**details):
        emit(state='Writing' if state=='Generating' else state,message='Writing the next original song' if state=='Generating' else message,**details)
    provider=provider or QwenProvider()
    for attempt in range(3):
        options['seed']=task['seed']+attempt
        with contextlib.redirect_stdout(sys.stderr):
            result=provider.generate(options,progress)
        try:
            song=parse_song(result['text'],task['recent'])
            if vocals!='instrumental':check_language(song['lyrics'],language)
            emit(song=song)
            return
        except ValueError as exc:
            if attempt==2:raise
            emit(state='Writing',message='Refining the song draft before making music',progress=None)
            options['direction']+=' Correction required: '+str(exc)+' '+direction+' Return a fresh, complete song following the requested length, using exactly TITLE:, STYLE:, and LYRICS: headings, each on its own line. Do not include commentary.'



if __name__=='__main__':
    provider=QwenProvider()
    for line in sys.stdin:
        try:
            main(json.loads(line),provider)
            emit(done=True)
        except Exception as exc:
            import traceback
            traceback.print_exc(file=sys.stderr);emit(error=str(exc)[:600]);break
