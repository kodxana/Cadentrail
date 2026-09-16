"""Publication boundary regressions: never package private data by accident."""
import hashlib
from zipfile import ZipFile
import pytest
from scripts.check_source import source_files, check_content, check_links
from scripts.package_release import write_archive

def test_unexpected_environment_and_binary_files_are_rejected(tmp_path):
    folder = tmp_path / "docs"
    folder.mkdir()
    secret = folder / ".env"
    secret.write_text("private")
    with pytest.raises(ValueError):
        source_files(tmp_path)
    secret.unlink()
    (folder / "weights.safetensors").write_bytes(b"weights")
    with pytest.raises(ValueError, match="Unexpected"):
        source_files(tmp_path)

def test_private_roots_never_enter_archive(tmp_path):
    (tmp_path / "README.md").write_text("Public")
    for name in (".runtime", ".data", ".venv", "node_modules"):
        (tmp_path / name).mkdir()
        (tmp_path / name / "private.txt").write_text("not public")
    assert [p.name for p in source_files(tmp_path)] == ["README.md"]

def test_credentials_rejected_without_echoing_value(tmp_path):
    value = ("hf_" + "A" * 40).encode()
    with pytest.raises(ValueError) as error:
        check_content(tmp_path / "README.md", value, tmp_path)
    assert value.decode() not in str(error.value)

def test_dead_document_links_fail(tmp_path):
    p = tmp_path / "README.md"
    p.write_text("[Missing](docs/missing.md)")
    with pytest.raises(ValueError, match="Missing public Markdown"):
        check_links([p], tmp_path)


@pytest.mark.parametrize("name", ["notes.md", "drafts/notes.md", "licenses/notes.md"])
def test_unreviewed_documentation_cannot_enter_source_package(tmp_path, name):
    path = tmp_path / "docs" / name
    path.parent.mkdir(parents=True)
    path.write_text("Unreviewed material")
    with pytest.raises(ValueError, match="Unreviewed public documentation"):
        source_files(tmp_path)


def test_reviewed_guides_and_runtime_assistant_skill_remain_public(tmp_path):
    names = ("docs/API.md", "docs/licenses/Demucs-MIT.txt", "backend/skills/cadentrail-runpod/SKILL.md")
    for name in names:
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("Reviewed product content")
    assert {p.relative_to(tmp_path).as_posix() for p in source_files(tmp_path)} == set(names)

def test_archive_is_reproducible_and_manifest_covers_every_source(tmp_path):
    root = tmp_path / "source"
    root.mkdir()
    p = root / "README.md"
    p.write_bytes(b"Public\r\n")
    first, second = tmp_path / "first.zip", tmp_path / "second.zip"
    write_archive(first, [p], root)
    p.touch()
    write_archive(second, [p], root)
    assert first.read_bytes() == second.read_bytes()
    with ZipFile(first) as archive:
        assert archive.read("cadentrail/README.md") == b"Public\n"
        manifest = archive.read("cadentrail/SOURCE-MANIFEST.sha256").decode()
        assert manifest == hashlib.sha256(b"Public\n").hexdigest() + "  README.md\n"
        assert len(archive.namelist()) == 2


def test_only_named_valid_repository_trailer_is_allowed(tmp_path):
    from scripts.check_source import check_tracked_media, REPOSITORY_MEDIA
    name = "media/cadentrail-trailer-github.mp4"
    assert REPOSITORY_MEDIA == {name}
    p = tmp_path / name
    p.parent.mkdir()
    p.write_bytes(b"not an MP4")
    with pytest.raises(ValueError, match="must be an MP4"):
        check_tracked_media({name}, tmp_path)
    p.write_bytes(bytes([0, 0, 0, 24]) + b"ftypisom")
    check_tracked_media({name}, tmp_path)
    assert p not in source_files(tmp_path)
