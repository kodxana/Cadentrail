import json
from uuid import uuid4
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.schema import Project, Candidate
from backend.storage import Store
from backend.library import library_index


def fixture_asset(store, project, name="Take.wav", origin="yue2"):
    path=store.project_dir(project.id)/name
    path.write_bytes(b"existing audio fixture")
    return store.add_asset(project.id, {"name":name,"path":name,"duration":123.5,"origin":origin,"lineage":{"source":"original"}})


def test_library_reuses_project_and_asset_metadata_without_exposing_scores_or_paths(tmp_path):
    store=Store(tmp_path)
    p=store.save(Project(name="Night window",artist="Artist",tags=["warm"],archived=True),create=True)
    a=fixture_asset(store,p)
    p.candidates=[Candidate(id=uuid4().hex,name="Take 2",assetId=a["id"],jobId="job",seed=19,favorite=True)]
    p.visuals.coverId=uuid4().hex
    store.save(p)
    data=library_index(Store(tmp_path))
    assert len(data["projects"])==len(data["tracks"])==1
    track=data["tracks"][0]
    assert track["title"]=="Night window" and track["version"]=="Take 2"
    assert track["favorite"] and track["archived"] and track["kind"]=="take"
    assert track["url"]==f"/api/assets/{a['id']}/audio"
    assert track["coverUrl"]==f"/api/projects/{p.id}/visuals/{p.visuals.coverId}"
    assert data["projects"][0]["songCount"]==1
    assert "path" not in track and "candidates" not in data["projects"][0]
    assert Store(tmp_path).load(p.id).candidates[0].seed==19


def test_missing_and_external_audio_stay_out_of_library_and_stems_are_distinct(tmp_path):
    store=Store(tmp_path/"storage");p=store.save(Project(),create=True)
    fixture_asset(store,p,"master.wav","master")
    fixture_asset(store,p,"vocals.wav","demucs")
    store.add_asset(p.id,{"name":"missing","path":"missing.wav","duration":10})
    outside=tmp_path/"external.wav";outside.write_bytes(b"private")
    store.add_asset(p.id,{"name":"external","path":str(outside),"duration":10})
    data=library_index(store)
    assert {t["kind"] for t in data["tracks"]}=={"master","stem"}
    assert data["projects"][0]["songCount"]==1


def test_library_favorites_update_shared_candidate_and_preserve_master_lineage(tmp_path,monkeypatch):
    monkeypatch.delenv("DAW_PASSWORD",raising=False)
    app=create_app(tmp_path,start_worker=False);store=app.state.store
    p=store.save(Project(name="Keep existing arrangement"),create=True)
    a=fixture_asset(store,p);master=fixture_asset(store,p,"master.wav","master")
    p.candidates=[Candidate(id=uuid4().hex,name="Original",assetId=a["id"],jobId="job",seed=31)]
    p=store.save(p)
    with TestClient(app) as client:
        for asset in (a,master):
            assert client.patch(f"/api/library/tracks/{asset['id']}",json={"favorite":True}).status_code==200
        assert store.load(p.id).candidates[0].favorite
        assert store.load(p.id).candidates[0].seed==31
        assert store.asset(master["id"])["lineage"]=={"source":"original"}
        assert all(t["favorite"] for t in client.get("/api/library").json()["tracks"])
        assert client.patch("/api/library/tracks/missing",json={"favorite":True}).status_code==404
    assert Store(tmp_path).asset(master["id"])["favorite"]


def test_only_full_length_single_source_masters_inherit_lyric_timing():
    from backend.library import timing_sources
    original={"id":"a","projectId":"p","duration":100,"origin":"yue2"}
    master={"id":"m","projectId":"p","duration":100,"origin":"master","lineage":{"sourceAssetIds":["a"]}}
    second={"id":"n","projectId":"p","duration":100,"origin":"master","lineage":{"sourceAssetIds":["m"]}}
    assets={a["id"]:a for a in (original,master,second)}
    assert timing_sources(second,assets)==["n","m","a"]
    assert timing_sources({**master,"duration":40},assets)==["m"]
    assert timing_sources({**master,"origin":"mix"},assets)==["m"]
    assert timing_sources({**master,"origin":"realaudio"},assets)==["m"]
    assert timing_sources({**master,"projectId":"other"},assets)==["m"]
    assert timing_sources({**master,"lineage":{"sourceAssetIds":["a","n"]}},assets)==["m"]
    assets["a"]={**original,"origin":"master","lineage":{"sourceAssetIds":["m"]}}
    assert timing_sources(second,assets)==["n","m","a"]
