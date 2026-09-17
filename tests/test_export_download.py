from email.message import Message
from fastapi.testclient import TestClient
from backend.app import create_app


def test_export_download_name_keeps_file_identity_and_extension(tmp_path, monkeypatch):
    monkeypatch.delenv('DAW_PASSWORD', raising=False)
    client = TestClient(create_app(tmp_path))
    exports = tmp_path / 'exports'
    exports.mkdir(exist_ok=True)
    (exports / 'render.wav').write_bytes(b'RIFF-test-audio')
    for requested, expected in [
        (None, 'render.wav'),
        ('Studio regression.wav', 'Studio regression.wav'),
        ('夜の歌.wav', '夜の歌.wav'),
        ('../bad\r\nname.exe', '_bad__name.wav'),
    ]:
        response = client.get('/api/exports/render.wav', params={'download_name': requested} if requested else {})
        assert response.status_code == 200
        assert response.content == b'RIFF-test-audio'
        header = Message()
        header['Content-Disposition'] = response.headers['content-disposition']
        assert header.get_filename() == expected
    assert client.get('/api/exports/missing.wav', params={'download_name': 'render.wav'}).status_code == 404
    assert client.get('/api/exports/render.wav', params={'download_name': 'x' * 201}).status_code == 422
