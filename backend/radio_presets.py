"""Persistent station recipes in the workstation database. Never stores audio or consent."""
import json,re,time
from fastapi import HTTPException,Query
from pydantic import BaseModel,Field,ConfigDict,field_validator
from .radio import StationSettings


class PresetSettings(StationSettings):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)


class PresetWrite(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    name:str=Field(min_length=1,max_length=80)
    settings:PresetSettings
    revision:int=Field(ge=0)

    @field_validator('settings')
    @classmethod
    def supported_writer(cls,value):
        from .providers import text_model
        text_model(value.model)
        return value


def valid_id(value):
    if not re.fullmatch(r'[a-f0-9]{32}',value):raise HTTPException(422,'Invalid saved station ID')


def register(app,store):
    @app.get('/api/radio/presets')
    def listing():
        with store.connect() as db:
            return [json.loads(row['data']) for row in db.execute('SELECT data FROM radio_presets ORDER BY updated DESC,id')]

    @app.put('/api/radio/presets/{preset_id}')
    def save(preset_id:str,request:PresetWrite):
        valid_id(preset_id)
        payload={'name':request.name,'settings':request.settings.model_dump()}
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT data FROM radio_presets WHERE id=?',(preset_id,)).fetchone()
            old=json.loads(row['data']) if row else None
            if old and all(old[k]==v for k,v in payload.items()):return old
            if request.revision!=(old['revision'] if old else 0):raise HTTPException(409,'This saved station changed in another tab. Reload the saved stations before trying again.')
            if old is None and db.execute('SELECT COUNT(*) FROM radio_presets').fetchone()[0]>=100:raise HTTPException(409,'You have 100 saved stations. Remove one before saving another.')
            result={**payload,'id':preset_id,'revision':request.revision+1,'updatedAt':time.time()}
            db.execute('INSERT OR REPLACE INTO radio_presets VALUES(?,?,?,?)',(preset_id,result['revision'],result['updatedAt'],json.dumps(result)))
        return result

    @app.delete('/api/radio/presets/{preset_id}')
    def remove(preset_id:str,revision:int=Query(ge=1)):
        valid_id(preset_id)
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT revision FROM radio_presets WHERE id=?',(preset_id,)).fetchone()
            if row is None:return {'ok':True}
            if row['revision']!=revision:raise HTTPException(409,'This saved station changed in another tab. Reload before removing it.')
            db.execute('DELETE FROM radio_presets WHERE id=?',(preset_id,))
        return {'ok':True}
