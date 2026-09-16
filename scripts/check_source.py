"""Audit the public source set without reading ignored workstation data."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = (".github", "backend", "src", "public", "scripts", "tests", "docs")
TOP = (
    "LICENSE", "NOTICE", "README.md", "CHANGELOG.md", "CREDITS.md",
    "CONTRIBUTING.md", "SECURITY.md", ".gitignore", ".dockerignore",
    ".gitattributes", ".editorconfig", "Dockerfile", "Dockerfile.patch",
    "pyproject.toml", "package.json", "package-lock.json", "tsconfig.json",
    "vite.config.ts", "vitest.config.ts", "playwright.config.ts", "index.html",
)
EXCLUDED = {"__pycache__", ".pytest_cache", "node_modules", ".git", ".runtime", ".data", ".venv", "dist", "build", "vendor-research"}
EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".json", ".css", ".html", ".md", ".txt", ".sh", ".yml", ".yaml", ".svg", ".png", ".jpg", ".webp", ".ico"}
SECRETS = [
    rb"-{5}BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-{5}",
    rb"\bhf_[A-Za-z0-9]{25,}\b",
    rb"\brpa_[A-Za-z0-9]{25,}\b",
    rb"\brps_[A-Za-z0-9]{25,}\b",
    rb"\bcdr_[A-Za-z0-9_-]{48}\b",
    rb"\bgh[pousr]_[A-Za-z0-9]{30,}\b",
    rb"\bgithub_pat_[A-Za-z0-9_]{40,}\b",
    rb"\bAKIA[A-Z0-9]{16}\b",
]
# Public promotional file uploaded separately through GitHub; never packaged.
REPOSITORY_MEDIA = {"media/cadentrail-trailer-github.mp4"}

# Only reviewed product guides and required notices belong in a source release.
DOCUMENTATION = {
    "docs/ACCESS.md", "docs/ANDROID-PLAYBACK.md", "docs/API.md",
    "docs/ARCHITECTURE.md", "docs/DEVELOPMENT.md",
    "docs/GENERATION-EXPECTATIONS.md", "docs/GUIDED-CREATE.md",
    "docs/HELP-AND-TOURS.md", "docs/MODEL-SETUP.md",
    "docs/MUSIC-ADAPTERS.md", "docs/RADIO.md", "docs/README.md",
    "docs/RELEASING.md", "docs/RUNPOD-SKILLS.md", "docs/RUNPOD-TEMPLATE.md",
    "docs/THIRD-PARTY.md", "docs/runpod-template.json",
    "docs/licenses/Demucs-MIT.txt", "docs/licenses/librosa-ISC.txt",
    "docs/licenses/NVIDIA-Open-Model-License.html",
}

PRIVATE_PROXY = re.compile(rb"https?://[a-z0-9]{12,14}-[0-9]+\.proxy\.runpod\.net")
LOCAL_ACCOUNT = re.compile(rb"[A-Z]:[/\\](?:Users|tempes|WSL)[/\\]", re.I)

def source_files(root=ROOT):
    """Explicit roots; unexpected nested files fail instead of silently shipping."""
    root = Path(root).resolve()
    paths = [root / name for name in TOP if (root / name).is_file()]
    def walk(folder):
        for p in sorted(folder.iterdir()):
            if p.is_symlink():
                raise ValueError(f"Linked source entry: {p.relative_to(root)}")
            if p.name in EXCLUDED:
                continue
            if p.is_dir():
                yield from walk(p)
            elif p.is_file():
                yield p
    for name in DIRECTORIES:
        folder = root / name
        if folder.is_symlink():
            raise ValueError(f"Linked source directory: {name}")
        if folder.is_dir():
            paths.extend(walk(folder))
    for p in paths:
        rel = p.relative_to(root)
        if p.is_symlink() or not p.resolve().is_relative_to(root):
            raise ValueError(f"Linked source file: {rel}")
        if len(rel.parts) > 1 and p.suffix.lower() not in EXTENSIONS:
            raise ValueError(f"Unexpected public file type: {rel}")
        if p.name.startswith(".env") or p.suffix.lower() in {".env", ".key", ".pem"}:
            raise ValueError(f"Private environment file: {rel}")
        if p.stat().st_size > 10 * 1024 * 1024:
            raise ValueError(f"Oversized source file: {rel}")
        if rel.parts[0] == "docs" and rel.as_posix() not in DOCUMENTATION:
            raise ValueError(f"Unreviewed public documentation: {rel}")
    return sorted(set(paths))

def check_content(path, data, root=ROOT):
    rel = path.relative_to(root)
    if any(re.search(pattern, data) for pattern in SECRETS):
        raise ValueError(f"Credential-like content in {rel}; value not printed")
    is_test = rel.parts[0] == "tests" or ".test." in path.name
    if not is_test and PRIVATE_PROXY.search(data):
        raise ValueError(f"Deployment-specific hostname in {rel}")
    if LOCAL_ACCOUNT.search(data):
        raise ValueError(f"Local account/workspace path in {rel}")

def check_links(files, root=ROOT):
    included = {p.resolve() for p in files}
    for p in files:
        if p.suffix != ".md":
            continue
        text = p.read_text(encoding="utf-8")
        text = re.sub(r"(?ms)^([\x60~]{3,}).*?^\1[^\n]*$", "", text)
        for raw in re.findall(r"!?\[[^\]\n]*\]\(([^)\n]+)\)", text):
            target = raw.strip().split(" ", 1)[0].strip("<>")
            url = urlsplit(target)
            if url.scheme or url.netloc or not url.path:
                continue
            destination = (p.parent / unquote(url.path)).resolve()
            if destination not in included and not (destination.is_dir() and any(q.is_relative_to(destination) for q in included)):
                raise ValueError(f"Missing public Markdown target in {p.relative_to(root)}: {target}")

def check_tracked_media(names, root=ROOT):
    for name in names & REPOSITORY_MEDIA:
        path = root / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 10_000_000:
            raise ValueError("Invalid repository trailer: " + name)
        with path.open("rb") as stream:
            header = stream.read(12)
        if header[4:8] != b"ftyp":
            raise ValueError("Repository trailer must be an MP4: " + name)

def validate(root=ROOT, tracked=False):
    root = Path(root).resolve()
    files = source_files(root)
    required = {"LICENSE", "NOTICE", "README.md", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md", ".github/workflows/ci.yml"}
    present = {p.relative_to(root).as_posix() for p in files}
    if not required <= present:
        raise ValueError("Missing publication files: " + ", ".join(sorted(required - present)))
    if "Apache License" not in (root / "LICENSE").read_text(encoding="utf-8"):
        raise ValueError("Application license is missing")
    for p in files:
        check_content(p, p.read_bytes(), root)
    check_links(files, root)
    if tracked:
        output = subprocess.check_output(["git", "ls-files", "-z"], cwd=root)
        names = set(output.decode().strip("\0").split("\0")) - {""}
        check_tracked_media(names, root)
        unexpected = names - present - REPOSITORY_MEDIA
        missing = present - names
        if unexpected or missing:
            raise ValueError(f"Tracked/public source mismatch: {len(unexpected)} unexpected, {len(missing)} missing files")
    return files

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tracked", action="store_true", help="Require Git's index to match the public file set")
    args = parser.parse_args()
    from scripts.changelog import check
    check()
    files = validate(tracked=args.tracked)
    print(json.dumps({"publicFiles": len(files), "bytes": sum(p.stat().st_size for p in files), "sourceScan": "PASS", "localMarkdownLinks": "PASS"}))

if __name__ == "__main__":
    main()
