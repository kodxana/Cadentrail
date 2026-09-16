import pytest
from backend.song_assistance import assistance_language, generate_draft
from backend.visual_api import TextOptions,validate_job
from backend.schema import Project,JobRequest
from backend.storage import Store

JAPANESE='[Verse]\n夜の窓に小さな灯り\n君の声が遠く響く\n雨の街を二人で歩く\n新しい朝を探している\n[Chorus]\n風に乗せて願いを届けよう\nいつかまたここで会えるから'
ENGLISH='[Verse]\nThe morning train is waiting on the other side of town\nI carry all the words we never said and put them down\nThe letters in my pocket tell a story of their own'

@pytest.mark.parametrize('options,expected',[
 ({'style':'J-pop, bright synths'},'ja'),({'style':'Lyrics are Japanese, pop duet'},'ja'),
 ({'style':'Japanese city pop','language':'pl'},'pl'),({'style':'Japanese J-pop with English lyrics'},'en'),
 ({'style':'English folk','direction':'Write lyrics in Japanese'},'ja'),
 ({'style':'Acoustic','operation':'rewrite','lyrics':JAPANESE},'ja'),
 ({'style':'Acoustic','operation':'generate'},'en'),
])
def test_language_intent(options,expected):
    assert assistance_language(TextOptions.model_validate(options).model_dump())==expected

def test_wrong_language_is_retried_before_saving():
    attempts=[]
    class Writer:
        def generate(self,request,progress):
            attempts.append(dict(request))
            return {'text':ENGLISH if len(attempts)==1 else JAPANESE,'model':'Qwen/Qwen3-1.7B','seed':request['seed'],'operation':'generate'}
    result=generate_draft(Writer(),{'style':'Japanese J-pop','seed':10},lambda *a:None)
    assert result['text']==JAPANESE and result['language']=='ja' and result['seed']==11
    assert len(attempts)==2 and 'Japanese' in attempts[0]['_lyricLanguage'] and 'Correction:' in attempts[1]['direction']

def test_all_wrong_drafts_fail_without_overwriting_and_arrangement_skips_language_check():
    class Writer:
        def generate(self,request,progress):return {'text':ENGLISH}
    with pytest.raises(ValueError,match='saved writing is unchanged'):generate_draft(Writer(),{'style':'Japanese J-pop'},lambda *a:None)
    assert generate_draft(Writer(),{'operation':'arrange','instrumental':True},lambda *a:None)['text']==ENGLISH

def test_job_freezes_language_and_blocks_instrumental_lyric_tasks(tmp_path,monkeypatch):
    monkeypatch.setattr('backend.visual_api.capabilities',lambda:{'text':{'available':True}})
    store=Store(tmp_path);p=store.save(Project(),create=True)
    request=validate_job(store,p,JobRequest(projectId=p.id,kind='lyrics',options={'style':'Japanese J-pop'}))
    assert request.options['language']=='ja'
    p.generation.role='instrumental'
    with pytest.raises(ValueError,match='arrangement assistance'):validate_job(store,p,JobRequest(projectId=p.id,kind='lyrics'))
    for operation in ('enhance','arrange'):
        request=validate_job(store,p,JobRequest(projectId=p.id,kind='lyrics',options={'operation':operation}))
        assert request.options['instrumental']
