"""Generate the public changelog from the same catalogue used by the app."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def render():
    releases = json.loads((ROOT / "src/changelog.json").read_text(encoding="utf-8"))
    versions = [r["version"] for r in releases]
    assert len(set(versions)) == len(versions), "Duplicate changelog version"
    assert versions == sorted(versions, key=lambda v: tuple(map(int, v.split("."))), reverse=True), "Sort releases numerically, newest first"
    assert versions[0] == json.loads((ROOT / "package.json").read_text())["version"], "Add this release to the changelog"
    lines = ["# Cadentrail changelog", "", "Product changes by version, newest first. Open Guide → What's new in the app to browse and search this history.", "", "Entries describe behavior at the time of each release. Early versions used the working title YuE2 Studio. Historical dates are omitted where no consistent record is available.", ""]
    for item in releases:
        lines += ["## " + item["version"] + " — " + item["title"], "", item["summary"], ""]
        assert item["changes"] and set(item["changes"]) <= {"Added", "Improved", "Fixed"}
        for kind, entries in item["changes"].items():
            assert entries and all(isinstance(text, str) and text.strip() for text in entries)
            lines += ["### " + kind, ""] + ["- " + text for text in entries] + [""]
    return "\n".join(lines)

def check():
    path = ROOT / "CHANGELOG.md"
    assert path.is_file() and path.read_text(encoding="utf-8") == render(), "Run python -m scripts.changelog to refresh CHANGELOG.md"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        check()
        print("Changelog version, coverage and Markdown consistency: PASS")
    else:
        (ROOT / "CHANGELOG.md").write_text(render(), encoding="utf-8")
        print("Updated CHANGELOG.md")
