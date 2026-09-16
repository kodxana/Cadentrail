import { useEffect, useRef, useState } from "react";
import { chordPitches, expandedNotes, transposeChord } from "./editing";
import { measured } from "./performance";
import {
  Music2,
  Code2,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Magnet,
  Download,
  Upload,
  Shuffle,
  Plus,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useStudio,
  getState,
  setState,
  selectedClip,
  selectedTrack,
  edit,
  editClip,
  beginGesture,
  preview,
  finishGesture,
  copy,
  paste,
  deleteSelected,
  notice,
  report,
} from "./store";
import {
  id,
  newNote,
  newTrack,
  newClip,
  noteName,
  clamp,
  bars,
  type Note,
} from "./model";
import { engine } from "./audio";
import { post, download } from "./api";
import { useSize, setupCanvas, rounded } from "./Canvas";
const KEY = 54,
  TOP = 25,
  H = 16;
export function PianoRoll({
  initialMode = "piano",
}: {
  initialMode?: "piano" | "abc";
}) {
  const s = useStudio(),
    p = s.project!,
    clip = selectedClip()?.assetId ? undefined : selectedClip(),
    track = selectedTrack();
  const [host, size] = useSize<HTMLDivElement>(),
    canvas = useRef<HTMLCanvasElement>(null),
    notation = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"piano" | "abc">(initialMode),
    [topPitch, setTopPitch] = useState(84),
    [zoom, setZoom] = useState(64),
    [scroll, setScroll] = useState(0),
    [box, setBox] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null);
  const drag = useRef<{
    mode: "move" | "resize" | "box";
    x: number;
    y: number;
    notes: Note[];
  } | null>(null);
  const snap = (b: number) => (s.snap ? Math.round(b / s.grid) * s.grid : b);
  const noteY = (pitch: number) => TOP + (topPitch - pitch) * H;
  useEffect(() => {
    let cancelled = false;
    if (mode === "abc" && notation.current && p.generation.abc) {
      void import("abcjs")
        .then(({ default: abcjs }) => {
          if (cancelled || !notation.current) return;
          abcjs.renderAbc(notation.current, p.generation.abc, {
            responsive: "resize",
            foregroundColor: "#f4f1ed",
            paddingtop: 15,
          });
        })
        .catch(report);
    }
    return () => {
      cancelled = true;
    };
  }, [mode, p.generation.abc]);
  useEffect(() => {
    if (!canvas.current || mode !== "piano") return;
    const began = performance.now();
    const ctx = setupCanvas(canvas.current, size.width, size.height),
      endY = size.height - 64;
    ctx.fillStyle = "#1c2028";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.font = '10px "DM Sans",system-ui';
    const minor = p.key.toLowerCase().includes("minor"),
      scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11],
      root = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ].indexOf(p.key.split(" ")[0]);
    for (let pitch = topPitch; noteY(pitch) < endY && pitch >= 0; pitch--) {
      const y = noteY(pitch),
        black = [1, 3, 6, 8, 10].includes(pitch % 12),
        inScale = scale.includes((pitch - root + 12) % 12);
      ctx.fillStyle = black ? "#191d25" : "#232731";
      ctx.fillRect(KEY, y, size.width - KEY, H);
      if (inScale) {
        ctx.fillStyle = "#ffffff05";
        ctx.fillRect(KEY, y, size.width - KEY, H);
      }
      ctx.strokeStyle = pitch % 12 === 0 ? "#41454f" : "#2e333e";
      ctx.beginPath();
      ctx.moveTo(0, y + H);
      ctx.lineTo(size.width, y + H);
      ctx.stroke();
      ctx.fillStyle = black ? "#2e333e" : "#a5a7ab";
      ctx.fillRect(0, y, KEY - 1, H - 1);
      ctx.fillStyle = black ? "#c4c5c9" : "#22252b";
      if (pitch % 12 === 0 || zoom > 100)
        ctx.fillText(noteName(pitch), 6, y + 12);
    }
    const bar = bars(p),
      visible = (size.width - KEY) / zoom,
      sub = zoom < 30 ? 1 : s.grid;
    for (
      let b = Math.floor(scroll / sub) * sub;
      b < scroll + visible + sub;
      b += sub
    ) {
      const x = KEY + (b - scroll) * zoom;
      ctx.strokeStyle = Math.abs(b % bar) < 0.001 ? "#41454f" : "#2e333e";
      ctx.beginPath();
      ctx.moveTo(x, TOP);
      ctx.lineTo(x, size.height);
      ctx.stroke();
      if (Math.abs(b % bar) < 0.001) {
        ctx.fillStyle = "#a4a8b0";
        ctx.fillText(String(Math.round(b / bar) + 1), x + 4, 17);
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(KEY, TOP, size.width - KEY, endY - TOP);
    ctx.clip();
    for (const t of p.tracks)
      for (const c of t.clips) {
        if (c.id === clip?.id) continue;
        ctx.fillStyle = "#ffffff12";
        for (const n of c.notes) {
          const x = KEY + (c.beat + n.beat - (clip?.beat ?? 0) - scroll) * zoom;
          rounded(ctx, x, noteY(n.pitch) + 2, n.duration * zoom - 1, H - 3);
        }
      }
    for (const n of clip?.notes ?? []) {
      const x = KEY + (n.beat - scroll) * zoom,
        y = noteY(n.pitch),
        w = n.duration * zoom;
      if (x + w < KEY || x > size.width) continue;
      const selected = s.selectedNotes.includes(n.id);
      ctx.fillStyle = selected ? "#f4f1ed" : (track?.color ?? "#74cdb0");
      ctx.globalAlpha = 0.4 + (n.velocity / 127) * 0.6;
      rounded(ctx, x + 1, y + 2, w - 2, H - 3);
      ctx.globalAlpha = 1;
      if (w > 28) {
        ctx.fillStyle = selected ? "#22252b" : "#22252b";
        ctx.fillText(noteName(n.pitch), x + 5, y + 12);
      }
      ctx.fillStyle = "#ffffff55";
      ctx.fillRect(x + w - 4, y + 4, 2, H - 7);
    }
    ctx.restore();
    ctx.fillStyle = "#191d25";
    ctx.fillRect(0, endY, size.width, 64);
    ctx.fillStyle = "#a4a8b0";
    ctx.fillText("VELOCITY", 7, endY + 15);
    for (const n of clip?.notes ?? []) {
      const x = KEY + (n.beat - scroll) * zoom;
      if (x < KEY || x > size.width) continue;
      ctx.fillStyle = s.selectedNotes.includes(n.id) ? "#f4f1ed" : "#659e85";
      ctx.fillRect(
        x,
        endY + 60 - (n.velocity / 127) * 48,
        3,
        (n.velocity / 127) * 48,
      );
    }
    if (box) {
      ctx.fillStyle = "#ffffff17";
      ctx.strokeStyle = "#e8e3db";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }
    measured("Piano roll draw", began);
  }, [
    clip,
    p.tracks,
    p.key,
    p.timeSignature,
    s.selectedNotes,
    topPitch,
    zoom,
    scroll,
    size,
    mode,
    box,
    s.grid,
    track?.color,
  ]);
  const pos = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!clip) return;
    const { x, y } = pos(e),
      pitch = clamp(topPitch - Math.floor((y - TOP) / H), 0, 127),
      beat = Math.max(0, (x - KEY) / zoom + scroll);
    if (x < KEY) {
      void engine.audition(pitch);
      return;
    }
    if (y < TOP) {
      setState({ cursor: clip.beat + snap(beat) });
      return;
    }
    if (y > size.height - 64) {
      const nearest = [...clip.notes].sort(
        (a, b) => Math.abs(a.beat - beat) - Math.abs(b.beat - beat),
      )[0];
      if (nearest && Math.abs(nearest.beat - beat) * zoom < 12) {
        editClip("Note velocity", (c) => {
          c.notes.find((n) => n.id === nearest.id)!.velocity = clamp(
            Math.round(((size.height - y - 4) / 48) * 127),
            1,
            127,
          );
        });
      }
      return;
    }
    const hit = [...clip.notes]
      .reverse()
      .find(
        (n) =>
          pitch === n.pitch && beat >= n.beat && beat <= n.beat + n.duration,
      );
    if (e.button === 2) {
      if (hit)
        editClip("Delete note", (c) => {
          c.notes = c.notes.filter((n) => n.id !== hit.id);
        });
      return;
    }
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit) {
      const selected = e.shiftKey
        ? [...new Set([...s.selectedNotes, hit.id])]
        : s.selectedNotes.includes(hit.id)
          ? s.selectedNotes
          : [hit.id];
      setState({ selectedNotes: selected });
      drag.current = {
        mode: (hit.beat + hit.duration - beat) * zoom < 7 ? "resize" : "move",
        x,
        y,
        notes: clip.notes.filter((n) => selected.includes(n.id)),
      };
      beginGesture();
      void engine.audition(hit.pitch, hit.velocity);
    } else if (e.shiftKey) {
      drag.current = { mode: "box", x, y, notes: [] };
      setState({ selectedNotes: [] });
    } else {
      const n = newNote(Math.max(0, snap(beat)), pitch, s.grid);
      editClip("Draw note", (c) => {
        c.notes.push(n);
        c.duration = Math.max(c.duration, n.beat + n.duration);
      });
      setState({ selectedNotes: [n.id] });
      void engine.audition(pitch);
    }
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || !clip) return;
    const { x, y } = pos(e);
    if (d.mode === "box") {
      const x1 = Math.min(x, d.x),
        y1 = Math.min(y, d.y),
        x2 = Math.max(x, d.x),
        y2 = Math.max(y, d.y);
      setBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      setState({
        selectedNotes: clip.notes
          .filter(
            (n) =>
              KEY + (n.beat + n.duration - scroll) * zoom > x1 &&
              KEY + (n.beat - scroll) * zoom < x2 &&
              noteY(n.pitch) + H > y1 &&
              noteY(n.pitch) < y2,
          )
          .map((n) => n.id),
      });
      return;
    }
    const delta = snap((x - d.x) / zoom),
      transpose = Math.round((d.y - y) / H),
      minBeat = Math.min(...d.notes.map((n) => n.beat)),
      minPitch = Math.min(...d.notes.map((n) => n.pitch)),
      maxPitch = Math.max(...d.notes.map((n) => n.pitch));
    preview((p) => {
      for (const t of p.tracks)
        for (const c of t.clips)
          if (c.id === clip.id) {
            for (const n of c.notes) {
              const old = d.notes.find((o) => o.id === n.id);
              if (!old) continue;
              if (d.mode === "resize")
                n.duration = Math.max(s.grid, old.duration + delta);
              else {
                n.beat = old.beat + Math.max(-minBeat, delta);
                n.pitch =
                  old.pitch + clamp(transpose, -minPitch, 127 - maxPitch);
              }
            }
            c.duration = Math.max(
              c.duration,
              ...c.notes.map((n) => n.beat + n.duration),
            );
          }
    });
  };
  const up = () => {
    if (drag.current?.mode !== "box") finishGesture("Edit notes");
    drag.current = null;
    setBox(null);
  };
  const transform = (label: string, fn: (n: Note) => void) =>
    editClip(label, (c) => {
      for (const n of c.notes) if (s.selectedNotes.includes(n.id)) fn(n);
    });
  const scoreToNotes = async () => {
    try {
      const result = await post<{
        notes: Note[];
        chords: ProjectChord[];
        warnings: string[];
      }>("/score/parse", { abc: p.generation.abc });
      const newTarget = !clip
        ? newTrack({
            type: "midi",
            name: "YuE2 score",
            clips: [newClip({ name: "Edited composition" })],
          })
        : null;
      edit("Import ABC into piano roll", (p) => {
        if (newTarget) p.tracks.push(newTarget);
        const c = p.tracks
          .flatMap((t) => t.clips)
          .find((c) => c.id === (clip?.id ?? newTarget!.clips[0].id))!;
        c.notes = result.notes;
        c.duration = Math.max(
          4,
          ...result.notes.map((n) => n.beat + n.duration),
        );
        p.chords = result.chords;
      });
      if (newTarget)
        setState({
          selectedTrack: newTarget.id,
          selectedClips: [newTarget.clips[0].id],
        });
      notice(result.warnings.join(" "));
      setMode("piano");
    } catch (e) {
      report(e);
    }
  };
  const notesToScore = async () => {
    try {
      if (!clip) throw new Error("Select an instrument clip first");
      const result = await post<{ abc: string }>("/score/write", {
        notes: expandedNotes(clip),
        chords: p.chords,
        tempo: p.tempo,
        timeSignature: p.timeSignature,
        title: p.name,
      });
      edit("Use edited composition", (p) => {
        p.generation.abc = result.abc;
        p.generation.useScore = true;
        if (p.generation.cot === "off") p.generation.cot = "full";
      });
      notice("Edited score is now selected for the next YuE2 candidate.");
      setMode("abc");
    } catch (e) {
      report(e);
    }
  };
  return (
    <section className="workspace piano">
      <div className="toolbar">
        <div className="segmented">
          <button
            className={mode === "piano" ? "active" : ""}
            onClick={() => setMode("piano")}
          >
            <Music2 size={14} /> Piano roll
          </button>
          <button
            className={mode === "abc" ? "active" : ""}
            onClick={() => setMode("abc")}
          >
            <Code2 size={14} /> ABC score
          </button>
        </div>
        <span className="dim">{clip?.name ?? "Select an instrument clip"}</span>
        <div className="spacer" />
        <button className="accent" onClick={() => void notesToScore()}>
          Use melody for YuE2 →
        </button>
      </div>
      <div className="chord-strip">
        <span className="eyebrow">CHORDS</span>
        <button
          title="Transpose all chords down a semitone"
          onClick={() =>
            edit("Transpose chords", (p) => {
              p.chords.forEach((c) => {
                c.symbol = transposeChord(c.symbol, -1);
              });
            })
          }
        >
          −1
        </button>
        <button
          title="Transpose all chords up a semitone"
          onClick={() =>
            edit("Transpose chords", (p) => {
              p.chords.forEach((c) => {
                c.symbol = transposeChord(c.symbol, 1);
              });
            })
          }
        >
          +1
        </button>
        {p.chords.map((c) => (
          <div className="chord-token" key={c.id}>
            <button
              title={"Audition " + c.symbol}
              onClick={() => {
                try {
                  for (const pitch of chordPitches(c.symbol))
                    void engine.audition(pitch, 80, 0.65).catch(report);
                } catch (e) {
                  report(e);
                }
              }}
            >
              ♪
            </button>
            <input
              aria-label="Chord symbol"
              value={c.symbol}
              onChange={(e) =>
                edit("Edit chord", (p) => {
                  p.chords.find((x) => x.id === c.id)!.symbol = e.target.value;
                })
              }
            />
            <input
              type="number"
              aria-label="Chord start beat"
              value={c.beat}
              min="0"
              step="0.25"
              onChange={(e) =>
                edit("Move chord", (p) => {
                  p.chords.find((x) => x.id === c.id)!.beat = Math.max(
                    0,
                    +e.target.value,
                  );
                })
              }
            />
            <input
              type="number"
              aria-label="Chord duration"
              value={c.duration}
              min="0.25"
              step="0.25"
              onChange={(e) =>
                edit("Resize chord", (p) => {
                  p.chords.find((x) => x.id === c.id)!.duration = Math.max(
                    0.25,
                    +e.target.value,
                  );
                })
              }
            />
            <button
              title="Delete chord"
              onClick={() =>
                edit("Delete chord", (p) => {
                  p.chords = p.chords.filter((x) => x.id !== c.id);
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          aria-label="Add chord"
          onClick={() =>
            edit("Add chord", (p) => {
              p.chords.push({
                id: id(),
                beat: Math.max(0, s.cursor - (clip?.beat ?? 0)),
                duration: 4,
                symbol: "C",
              });
            })
          }
        >
          <Plus size={13} />
        </button>
      </div>
      {mode === "piano" ? (
        <>
          <div className="toolbar compact">
            <button
              title="Quantize selected notes"
              onClick={() =>
                transform("Quantize", (n) => {
                  n.beat = Math.max(0, Math.round(n.beat / s.grid) * s.grid);
                  n.duration = Math.max(
                    s.grid,
                    Math.round(n.duration / s.grid) * s.grid,
                  );
                })
              }
            >
              Quantize
            </button>
            <button
              title="Humanize selected notes"
              onClick={() =>
                transform("Humanize", (n) => {
                  n.beat = Math.max(0, n.beat + (Math.random() - 0.5) * 0.05);
                  n.velocity = clamp(
                    n.velocity + Math.round((Math.random() - 0.5) * 16),
                    1,
                    127,
                  );
                })
              }
            >
              <Shuffle size={13} />
            </button>
            <button
              title="Transpose up (Shift: octave)"
              onClick={(e) =>
                transform("Transpose", (n) => {
                  n.pitch = clamp(n.pitch + (e.shiftKey ? 12 : 1), 0, 127);
                })
              }
            >
              <ArrowUp size={13} />
            </button>
            <button
              title="Transpose down (Shift: octave)"
              onClick={(e) =>
                transform("Transpose", (n) => {
                  n.pitch = clamp(n.pitch - (e.shiftKey ? 12 : 1), 0, 127);
                })
              }
            >
              <ArrowDown size={13} />
            </button>
            <button
              title="Duplicate notes"
              onClick={() => paste("notes", true)}
            >
              <Copy size={13} />
            </button>
            <button
              title="Delete notes"
              onClick={() => deleteSelected("notes")}
            >
              <Trash2 size={13} />
            </button>
            <label>
              Velocity{" "}
              <input
                aria-label="Selected note velocity"
                type="number"
                min="1"
                max="127"
                value={
                  clip?.notes.find((n) => s.selectedNotes.includes(n.id))
                    ?.velocity ?? 96
                }
                onChange={(e) =>
                  transform("Velocity", (n) => {
                    n.velocity = clamp(+e.target.value, 1, 127);
                  })
                }
              />
            </label>
            <div className="spacer" />
            <select
              aria-label="Piano roll grid"
              value={s.grid}
              onChange={(e) => setState({ grid: +e.target.value })}
            >
              <option value="1">1/4</option>
              <option value="0.5">1/8</option>
              <option value="0.25">1/16</option>
              <option value={1 / 3}>1/8 triplet</option>
              <option value={1 / 6}>1/16 triplet</option>
              <option value="0.125">1/32</option>
            </select>
            <button
              className={s.snap ? "active" : ""}
              onClick={() => setState({ snap: !s.snap })}
            >
              <Magnet size={13} />
            </button>
            <button onClick={() => setZoom(Math.max(16, zoom / 1.25))}>
              <ZoomOut size={14} />
            </button>
            <button onClick={() => setZoom(Math.min(240, zoom * 1.25))}>
              <ZoomIn size={14} />
            </button>
          </div>
          <div className="canvas-host" ref={host}>
            <canvas
              ref={canvas}
              aria-label="Piano roll editor"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={(e) => {
                if (e.shiftKey)
                  setScroll(Math.max(0, scroll + e.deltaY / zoom));
                else
                  setTopPitch(
                    clamp(topPitch + Math.sign(e.deltaY) * -2, 24, 127),
                  );
              }}
            />
          </div>
          <div className="timeline-scroll">
            <span>Beat {scroll.toFixed(1)}</span>
            <input
              type="range"
              aria-label="Piano horizontal scroll"
              min="0"
              max={Math.max(32, clip?.duration ?? 32)}
              step="0.25"
              value={scroll}
              onChange={(e) => setScroll(+e.target.value)}
            />
            <span>Click: draw · Shift-drag: select · Right-click: delete</span>
          </div>
        </>
      ) : (
        <div className="score-split">
          <div>
            <div className="toolbar compact">
              <button onClick={() => void scoreToNotes()}>
                <Upload size={13} /> Apply ABC to piano roll
              </button>
              <button
                onClick={() => download(p.name + ".abc", p.generation.abc)}
              >
                <Download size={13} /> ABC
              </button>
            </div>
            <textarea
              aria-label="ABC source"
              className="abc-source"
              spellCheck={false}
              value={p.generation.abc}
              placeholder={"X:1\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nC D E G |"}
              onChange={(e) =>
                edit("Edit ABC", (p) => {
                  p.generation.abc = e.target.value;
                })
              }
            />
            <p className="help">
              Original notation remains in candidate history. Applying visual
              edits normalizes repeats and articulation. Regeneration creates a
              new complete take.
            </p>
          </div>
          <div className="notation" ref={notation} />
        </div>
      )}
    </section>
  );
}
type ProjectChord = {
  id: string;
  beat: number;
  duration: number;
  symbol: string;
};
