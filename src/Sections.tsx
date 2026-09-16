import { useStudio, edit, setState, report } from "./store";
import { id, type Project, type Clip } from "./model";
import { splitClip } from "./editing";
import { engine } from "./audio";

export function duplicateSection(p: Project, sectionId: string) {
  const section = p.sections.find((s) => s.id === sectionId);
  if (!section) return;
  const start = section.beat,
    end = start + section.duration,
    amount = section.duration;
  for (const t of p.tracks) {
    const copies: Clip[] = [];
    for (const c of t.clips) {
      if (c.beat >= end || c.beat + c.duration <= start) continue;
      let crop = structuredClone(c);
      if (crop.beat < start) crop = splitClip(crop, start, p.tempo)[1];
      if (crop.beat + crop.duration > end)
        crop = splitClip(crop, end, p.tempo)[0];
      crop.id = id();
      crop.notes = crop.notes.map((n) => ({ ...n, id: id() }));
      crop.beat += amount;
      copies.push(crop);
    }
    t.clips = t.clips.flatMap((c) =>
      c.beat < end && c.beat + c.duration > end
        ? splitClip(c, end, p.tempo)
        : [c],
    );
    for (const c of t.clips) if (c.beat >= end) c.beat += amount;
    t.clips.push(...copies);
    for (const a of t.automation) {
      const added = a.points
        .filter((n) => n.beat >= start && n.beat < end)
        .map((n) => ({ ...n, id: id(), beat: n.beat + amount }));
      for (const n of a.points) if (n.beat >= end) n.beat += amount;
      a.points.push(...added);
      a.points.sort((a, b) => a.beat - b.beat);
    }
  }
  const harmony = p.chords
    .filter((c) => c.beat >= start && c.beat < end)
    .map((c) => ({ ...c, id: id(), beat: c.beat + amount }));
  for (const chord of p.chords) if (chord.beat >= end) chord.beat += amount;
  p.chords.push(...harmony);
  for (const s of p.sections) if (s.beat >= end) s.beat += amount;
  p.sections.push({
    ...section,
    id: id(),
    beat: end,
    name: section.name + " copy",
  });
  if (p.loopEnd >= end) p.loopEnd += amount;
}
export function Sections() {
  const s = useStudio(),
    p = s.project!;
  return (
    <details className="sections-editor">
      <summary>Song sections & lyrics · {p.sections.length}</summary>
      {p.sections.map((section) => (
        <div className="section-edit" key={section.id}>
          <div className="toolbar compact">
            <input
              aria-label="Section name"
              value={section.name}
              onChange={(e) =>
                edit("Rename section", (p) => {
                  p.sections.find((x) => x.id === section.id)!.name =
                    e.target.value;
                })
              }
            />
            <label>
              Beat{" "}
              <input
                type="number"
                aria-label="Section beat"
                min="0"
                value={section.beat}
                onChange={(e) =>
                  edit("Move section marker", (p) => {
                    p.sections.find((x) => x.id === section.id)!.beat =
                      Math.max(0, +e.target.value);
                  })
                }
              />
            </label>
            <label>
              Length{" "}
              <input
                type="number"
                aria-label="Section length"
                min=".25"
                step=".25"
                value={section.duration}
                onChange={(e) =>
                  edit("Resize section marker", (p) => {
                    p.sections.find((x) => x.id === section.id)!.duration =
                      Math.max(0.25, +e.target.value);
                  })
                }
              />
            </label>
            <button
              onClick={() => void engine.seek(section.beat).catch(report)}
            >
              Jump
            </button>
            <button
              onClick={() => {
                setState({
                  selectedClips: p.tracks
                    .flatMap((t) => t.clips)
                    .filter(
                      (c) =>
                        c.beat < section.beat + section.duration &&
                        c.beat + c.duration > section.beat,
                    )
                    .map((c) => c.id),
                });
                edit("Loop section", (p) => {
                  p.loopStart = section.beat;
                  p.loopEnd = section.beat + section.duration;
                });
              }}
            >
              Select region
            </button>
            <button
              onClick={() =>
                edit("Duplicate section with arrangement", (p) =>
                  duplicateSection(p, section.id),
                )
              }
            >
              Duplicate & insert
            </button>
            <button
              onClick={() =>
                edit("Delete section marker", (p) => {
                  p.sections = p.sections.filter((x) => x.id !== section.id);
                })
              }
            >
              ×
            </button>
          </div>
          <textarea
            aria-label={"Lyrics for " + section.name}
            placeholder="Section lyrics or notes"
            value={section.lyrics}
            rows={2}
            onChange={(e) =>
              edit("Edit section lyrics", (p) => {
                p.sections.find((x) => x.id === section.id)!.lyrics =
                  e.target.value;
              })
            }
          />
        </div>
      ))}
      <div className="toolbar compact">
        <button
          onClick={() =>
            edit("Use section lyrics", (p) => {
              p.generation.lyrics = [...p.sections]
                .sort((a, b) => a.beat - b.beat)
                .filter((s) => s.lyrics.trim())
                .map((s) => "[" + s.name + "]\n" + s.lyrics)
                .join("\n\n");
            })
          }
        >
          Use section lyrics for next YuE2 take
        </button>
        <span className="help">
          Marker times are editable guides; they are not inferred lyric
          alignment.
        </span>
      </div>
    </details>
  );
}
