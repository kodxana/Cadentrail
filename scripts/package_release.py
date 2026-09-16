"""Create a reproducible public source archive and its checksum manifest."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
from scripts.check_source import ROOT, validate

BINARY = {".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2"}

def payload(path):
    data = path.read_bytes()
    if path.suffix.lower() not in BINARY:
        data = data.decode("utf-8").replace("\r\n", "\n").encode("utf-8")
    return data

def write_archive(output, files, root=ROOT):
    entries = {p.relative_to(root).as_posix(): payload(p) for p in files}
    manifest = "".join(hashlib.sha256(data).hexdigest() + "  " + name + "\n" for name, data in sorted(entries.items()))
    entries["SOURCE-MANIFEST.sha256"] = manifest.encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(entries.items()):
            info = ZipInfo("cadentrail/" + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if name.endswith(".sh") else 0o100644) << 16
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=9)
    with ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive integrity check failed")
        for name, data in entries.items():
            if archive.read("cadentrail/" + name) != data:
                raise ValueError("Archive content mismatch")
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + ".sha256").write_text(digest + "  " + output.name + "\n", encoding="utf-8", newline="\n")
    return {"path": str(output), "files": len(entries), "bytes": output.stat().st_size, "sha256": digest, "sourceScan": "PASS", "archiveIntegrity": "PASS"}

def main():
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default=version)
    parser.add_argument("--output-dir", type=Path, default=ROOT / ".runtime/releases")
    args = parser.parse_args()
    if args.version != version:
        parser.error("Package the current source version; use its checkout for an older release")
    from scripts.changelog import check
    check()
    files = validate()
    result = write_archive(args.output_dir.resolve() / f"cadentrail-{version}-source.zip", files)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
