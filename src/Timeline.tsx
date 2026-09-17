import { trimClip, expandedNotes } from "./editing";
import { measured } from "./performance";
import { Sections } from "./Sections";
import { StudioContextMenu, StudioTrackMenu } from "./StudioTrackMenu";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Scissors,
  Copy,
  Trash2,
  Magnet,
  Layers,
} from "lucide-react";
import {
  useStudio,
  getState,
  setState,
  edit,
  beginGesture,
  preview,
  finishGesture,
  addTrack,
  split,
  paste,
  deleteSelected,
  notice,
  report,
  refreshAssets,
} from "./store";
import {
  bars,
  clamp,
  endBeat,
  id,
  newClip,
  type Clip,
  type Peaks,
} from "./model";
import { engine } from "./audio";
import { useSize, setupCanvas, rounded } from "./Canvas";
import { api, post } from "./api";
const HEADER = 190,
  TOP = 76,
  ROW = 82;
const peakCache = new Map<string, Peaks>();
type Drag = {
  x: number;
  y: number;
  beat: number;
  track: number;
  clip: string | null;
  mode: "move" | "left" | "right" | "select";
  initial: Clip[];
};
export function Timeline() {
  const s = useStudio(),
    p = s.project!;
  const [host, size] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null),
    playhead = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [vertical, setVertical] = useState(0),
    [peakVersion, setPeakVersion] = useState(0),
    [selection, setSelection] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null),
    [menu, setMenu] = useState<{ x: number; y: number; trackId?: string } | null>(null);
  const visible = Math.max(1, (size.width - HEADER) / s.zoom),
    scroll = clamp(s.scroll, 0, Math.max(0, endBeat(p) + 32 - visible));
  const xBeat = (x: number) => (x - HEADER) / s.zoom + scroll;
  const trackAt = (y: number) => Math.floor((y - TOP + vertical) / ROW);
  const snapped = (b: number) => (s.snap ? Math.round(b / s.grid) * s.grid : b);
  useEffect(() => {
    setVertical((value) => Math.min(value, Math.max(0, p.tracks.length * ROW - size.height + TOP)));
  }, [p.tracks.length, size.height]);
  useEffect(() => {
    for (const a of s.assets)
      if (!peakCache.has(a.id)) {
        void api<Peaks>(`/assets/${a.id}/peaks?points=6000`)
          .then((data) => {
            peakCache.set(a.id, data);
            setPeakVersion((v) => v + 1);
          })
          .catch(report);
      }
  }, [s.assets]);
  useEffect(() => {
    if (!canvas.current) return;
    const began = performance.now();
    const ctx = setupCanvas(canvas.current, size.width, size.height);
    ctx.fillStyle = "#1c2028";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.font = "11px DM Sans, system-ui";
    const bar = bars(p),
      sub = s.zoom > 70 ? s.grid : s.zoom > 20 ? 1 : bar;
    for (
      let b = Math.floor(scroll / sub) * sub;
      b < scroll + visible + sub;
      b += sub
    ) {
      const x = HEADER + (b - scroll) * s.zoom;
      ctx.strokeStyle = Math.abs(b % bar) < 0.001 ? "#363b40" : "#22272b";
      ctx.beginPath();
      ctx.moveTo(x, 46);
      ctx.lineTo(x, size.height);
      ctx.stroke();
      if (Math.abs(b % bar) < 0.001) {
        ctx.fillStyle = "#8d969f";
        ctx.fillText(String(Math.floor(b / bar) + 1), x + 5, 39);
      }
    }
    for (let i = 0; i < p.tracks.length; i++) {
      const t = p.tracks[i],
        y = TOP + i * ROW - vertical;
      if (y + ROW < TOP || y > size.height) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(HEADER, TOP, size.width - HEADER, size.height - TOP);
      ctx.clip();
      if (t.id === s.selectedTrack) {
        ctx.fillStyle = "#ffffff04";
        ctx.fillRect(HEADER, y, size.width - HEADER, ROW);
      }
      ctx.strokeStyle = "#30353a";
      ctx.beginPath();
      ctx.moveTo(0, y + ROW);
      ctx.lineTo(size.width, y + ROW);
      ctx.stroke();
      for (const c of t.clips) {
        const x = HEADER + (c.beat - scroll) * s.zoom,
          w = c.duration * s.zoom;
        if (x + w < HEADER || x > size.width) continue;
        const selected = s.selectedClips.includes(c.id);
        ctx.globalAlpha = c.muted || t.mute ? 0.35 : 1;
        ctx.fillStyle = c.color + (selected ? "70" : "36");
        rounded(ctx, x + 1, y + 8, w - 2, ROW - 16);
        ctx.strokeStyle = selected ? "#f4f1ed" : c.color + "85";
        ctx.lineWidth = selected ? 1.5 : 1;
        ctx.strokeRect(x + 1, y + 8, w - 2, ROW - 16);
        ctx.fillStyle = c.color;
        ctx.fillRect(x + 1, y + 8, w - 2, 18);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 4, y + 9, w - 8, 16);
        ctx.clip();
        ctx.fillStyle = "#101719";
        ctx.font = '600 10px "DM Sans",system-ui';
        ctx.fillText(c.name, x + 7, y + 21);
        ctx.restore();
        if (c.assetId) {
          const peaks = peakCache.get(c.assetId);
          if (peaks) {
            const first = Math.max(x + 2, HEADER),
              last = Math.min(x + w - 2, size.width),
              secondsPerBeat = 60 / p.tempo;
            ctx.fillStyle = c.color;
            for (let px = first; px < last; px += 2) {
              let seconds = c.offset + ((px - x) / s.zoom) * secondsPerBeat;
              if (c.reverse)
                seconds =
                  c.offset +
                  c.duration * secondsPerBeat -
                  ((px - x) / s.zoom) * secondsPerBeat;
              const index = Math.floor(
                (seconds * peaks.sampleRate) / peaks.hop,
              );
              const data = peaks.peaks[index];
              if (!data) continue;
              for (let ch = 0; ch < Math.min(2, data.length); ch++) {
                const [min, max] = data[ch];
                const cy = y + 38 + ch * 19;
                ctx.fillRect(
                  px,
                  cy - max * 9,
                  1.4,
                  Math.max(1, (max - min) * 9),
                );
              }
            }
          } else {
            ctx.fillStyle = "#c0c1c5";
            ctx.fillText(
              "Loading waveform…",
              Math.max(HEADER + 8, x + 10),
              y + 51,
            );
          }
        } else {
          ctx.fillStyle = c.color;
          for (const n of expandedNotes(c)) {
            const nx = x + n.beat * s.zoom;
            if (nx < HEADER || nx > x + w || nx > size.width) continue;
            const ny = y + 34 + (84 - n.pitch) * 0.65;
            ctx.fillRect(
              nx,
              clamp(ny, y + 30, y + ROW - 15),
              Math.max(2, Math.min(n.duration * s.zoom, w - (nx - x))),
              3,
            );
          }
        }
        if (c.fadeIn || c.fadeOut) {
          ctx.strokeStyle = "#f4f1edb0";
          ctx.beginPath();
          ctx.moveTo(x, y + ROW - 8);
          ctx.lineTo(x + c.fadeIn * s.zoom, y + 28);
          ctx.lineTo(x + w - c.fadeOut * s.zoom, y + 28);
          ctx.lineTo(x + w, y + ROW - 8);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    ctx.fillStyle = "#191d25";
    ctx.fillRect(0, 0, size.width, 28);
    for (const section of p.sections) {
      const x = HEADER + (section.beat - scroll) * s.zoom,
        w = section.duration * s.zoom;
      if (x + w < HEADER || x > size.width) continue;
      ctx.fillStyle = "#454952";
      ctx.fillRect(Math.max(HEADER, x), 2, Math.min(w, size.width - x), 23);
      ctx.fillStyle = "#d4d3d1";
      ctx.fillText(section.name, Math.max(HEADER + 4, x + 7), 17);
    }
    ctx.fillStyle = "#252932";
    ctx.fillRect(HEADER, 47, size.width - HEADER, 29);
    for (const chord of p.chords) {
      const x = HEADER + (chord.beat - scroll) * s.zoom;
      if (x < HEADER - 40 || x > size.width) continue;
      ctx.fillStyle = "#b2a0d3";
      ctx.fillText(chord.symbol, x + 5, 66);
    }
    ctx.fillStyle = "#292d35";
    ctx.fillRect(0, 0, HEADER, TOP);
    ctx.fillStyle = "#8f9a9d";
    ctx.font = '10px "DM Sans",system-ui';
    ctx.fillText("TRACKS / " + p.tracks.length, 14, 40);
    ctx.fillStyle = "#1c2028";
    ctx.fillRect(0, TOP, HEADER, size.height - TOP);
    for (let i = 0; i < p.tracks.length; i++) {
      const t = p.tracks[i],
        y = TOP + i * ROW - vertical;
      if (y < TOP - ROW || y > size.height) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, TOP, HEADER, size.height - TOP);
      ctx.clip();
      ctx.fillStyle = t.id === s.selectedTrack ? "#3b3e45" : "#282c34";
      ctx.fillRect(0, y, HEADER - 1, ROW - 1);
      ctx.fillStyle = t.color;
      ctx.fillRect(0, y, 3, ROW - 1);
      ctx.font = '600 12px "DM Sans",system-ui';
      ctx.fillText(t.name.slice(0, 21), 14, y + 24);
      ctx.fillStyle = "#a4a8b0";
      ctx.font = '10px "DM Sans",system-ui';
      ctx.fillText(t.type.toUpperCase(), 14, y + 43);
      ctx.fillStyle = t.mute ? "#d2b36e" : "#3c4048";
      rounded(ctx, 14, y + 52, 24, 20);
      ctx.fillStyle = t.solo ? "#83cbae" : "#3c4048";
      rounded(ctx, 43, y + 52, 24, 20);
      ctx.fillStyle = "#e0e7e5";
      ctx.fillText("M", 21, y + 66);
      ctx.fillText("S", 51, y + 66);
      ctx.fillStyle = "#a4a8b0";
      ctx.fillText(`${Math.round(t.volume * 100)}%`, 137, y + 66);
      ctx.restore();
    }
    if (s.loop) {
      ctx.fillStyle = "#ffffff25";
      ctx.fillRect(
        HEADER + (p.loopStart - scroll) * s.zoom,
        28,
        (p.loopEnd - p.loopStart) * s.zoom,
        17,
      );
    }
    if (selection) {
      ctx.fillStyle = "#ffffff17";
      ctx.strokeStyle = "#e8e3db";
      ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
      ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
    }
    measured("Timeline draw", began);
  }, [
    p,
    s.selectedTrack,
    s.selectedClips,
    s.zoom,
    s.grid,
    s.loop,
    scroll,
    vertical,
    size,
    peakVersion,
    selection,
  ]);
  useEffect(() => {
    let frame: number;
    let last = 0;
    const draw = () => {
      if (last) measured("Timeline frame interval", last);
      last = performance.now();
      if (playhead.current) {
        const ctx = setupCanvas(playhead.current, size.width, size.height),
          beat = s.playing ? engine.beat() : getState().cursor,
          x = HEADER + (beat - scroll) * s.zoom;
        if (x >= HEADER && x < size.width) {
          ctx.strokeStyle = "#ede9e1";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, 28);
          ctx.lineTo(x, size.height);
          ctx.stroke();
          ctx.fillStyle = "#ede9e1";
          ctx.beginPath();
          ctx.moveTo(x - 5, 28);
          ctx.lineTo(x + 5, 28);
          ctx.lineTo(x, 35);
          ctx.fill();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [size, scroll, s.zoom, s.playing]);
  const position = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setMenu(null);
    const { x, y } = position(e);
    const index = trackAt(y),
      t = p.tracks[index];
    if (x < HEADER) {
      if (t) {
        setState({ selectedTrack: t.id, selectedClips: [], selectedNotes: [] });
        const local = y - (TOP + index * ROW - vertical);
        if (local > 50 && local < 75 && x < 70)
          edit(x < 40 ? "Mute track" : "Solo track", (p) => {
            const track = p.tracks[index];
            if (x < 40) track.mute = !track.mute;
            else track.solo = !track.solo;
          });
      }
      return;
    }
    if (y < TOP) {
      if (y >= 28 && y < 47) void engine.seek(Math.max(0, snapped(xBeat(x))));
      return;
    }
    if (!t) return;
    const beat = xBeat(x),
      c = [...t.clips]
        .reverse()
        .find((c) => beat >= c.beat && beat <= c.beat + c.duration);
    setState({ selectedTrack: t.id });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (c) {
      let clips = e.shiftKey
        ? [...new Set([...s.selectedClips, c.id])]
        : s.selectedClips.includes(c.id)
          ? s.selectedClips
          : [c.id];
      if (c.group)
        clips = [
          ...new Set([
            ...clips,
            ...p.tracks
              .flatMap((t) => t.clips)
              .filter((x) => x.group === c.group)
              .map((x) => x.id),
          ]),
        ];
      setState({ selectedClips: clips });
      const mode =
        Math.abs((c.beat + c.duration - beat) * s.zoom) < 8
          ? "right"
          : Math.abs((beat - c.beat) * s.zoom) < 7
            ? "left"
            : "move";
      drag.current = {
        x,
        y,
        beat,
        track: index,
        clip: c.id,
        mode,
        initial: p.tracks
          .flatMap((t) => t.clips)
          .filter((c) => clips.includes(c.id)),
      };
      beginGesture();
    } else {
      setState({ selectedClips: [], cursor: Math.max(0, snapped(beat)) });
      drag.current = {
        x,
        y,
        beat,
        track: index,
        clip: null,
        mode: "select",
        initial: [],
      };
    }
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = position(e),
      delta = snapped((x - d.x) / s.zoom);
    if (d.mode === "select") {
      const x1 = Math.min(d.x, x),
        y1 = Math.min(d.y, y);
      setSelection({
        x: x1,
        y: y1,
        w: Math.abs(x - d.x),
        h: Math.abs(y - d.y),
      });
      setState({
        selectedClips: p.tracks.flatMap((t, i) =>
          t.clips
            .filter(
              (c) =>
                HEADER + (c.beat + c.duration - scroll) * s.zoom > x1 &&
                HEADER + (c.beat - scroll) * s.zoom < Math.max(d.x, x) &&
                TOP + (i + 1) * ROW - vertical > y1 &&
                TOP + i * ROW - vertical < Math.max(d.y, y),
            )
            .map((c) => c.id),
        ),
      });
      return;
    }
    preview((project) => {
      for (const track of project.tracks)
        for (const c of track.clips) {
          const old = d.initial.find((v) => v.id === c.id);
          if (!old) continue;
          if (d.mode === "move") c.beat = Math.max(0, old.beat + delta);
          if (d.mode === "right" || d.mode === "left")
            Object.assign(
              c,
              trimClip(old, d.mode, delta, project.tempo, s.grid),
            );
        }
      if (d.mode === "move" && d.initial.length === 1) {
        const dest = clamp(trackAt(y), 0, project.tracks.length - 1);
        if (dest !== d.track) {
          const source = project.tracks[d.track];
          const c = source.clips.find((c) => c.id === d.clip);
          if (c) {
            source.clips = source.clips.filter((c) => c.id !== d.clip);
            project.tracks[dest].clips.push(c);
          }
        }
      }
    });
  };
  const up = () => {
    if (drag.current && drag.current.mode !== "select")
      finishGesture("Edit clips");
    drag.current = null;
    setSelection(null);
  };
  const addSection = () =>
    edit("Add section", (p) => {
      p.sections.push({
        id: id(),
        name: "Verse",
        beat: s.cursor,
        duration: bars(p) * 4,
        lyrics: "",
      });
    });
  return (
    <section className="workspace arrangement">
      <div className="toolbar">
        <div className="toolgroup">
          <button onClick={() => addTrack("audio")}>
            <Plus size={14} /> Audio
          </button>
          <button title="Add MIDI notes with a built-in preview synth; this is not a YuE2 instrument slot" onClick={() => addTrack("midi")}>
            <Plus size={14} /> MIDI instrument
          </button>
          <button onClick={addSection}>
            <Layers size={14} /> Section
          </button>
        </div>
        <div className="toolgroup">
          <button title="Split at cursor (S)" onClick={split}>
            <Scissors size={15} />
          </button>
          <button
            title="Duplicate (Ctrl+D)"
            onClick={() => paste("clips", true)}
          >
            <Copy size={15} />
          </button>
          <button
            title="Delete selected clips"
            onClick={() => deleteSelected()}
          >
            <Trash2 size={15} />
          </button>
          <button
            className={s.snap ? "active" : ""}
            title="Snap"
            onClick={() => setState({ snap: !s.snap })}
          >
            <Magnet size={15} />
          </button>
          <select
            aria-label="Timeline grid"
            value={s.grid}
            onChange={(e) => setState({ grid: +e.target.value })}
          >
            <option value="1">1 beat</option>
            <option value="0.5">1/8</option>
            <option value="0.25">1/16</option>
            <option value={1 / 3}>1/8 triplet</option>
            <option value="0.125">1/32</option>
          </select>
        </div>
        <div className="spacer" />
        <button
          title="Group selected clips"
          onClick={() =>
            edit("Group clips", (p) => {
              const group = id();
              for (const t of p.tracks)
                for (const c of t.clips)
                  if (s.selectedClips.includes(c.id)) c.group = group;
            })
          }
        >
          Group
        </button>
        <button
          title="Ungroup selected clips"
          onClick={() =>
            edit("Ungroup clips", (p) => {
              for (const t of p.tracks)
                for (const c of t.clips)
                  if (s.selectedClips.includes(c.id)) c.group = null;
            })
          }
        >
          Ungroup
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => setState({ zoom: Math.max(4, s.zoom / 1.3) })}
        >
          <ZoomOut size={15} />
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => setState({ zoom: Math.min(240, s.zoom * 1.3) })}
        >
          <ZoomIn size={15} />
        </button>
        <span className="dim">{Math.round((s.zoom / 48) * 100)}%</span>
      </div>
      <Sections />
      <div className="canvas-host" ref={host}>
        <canvas
          ref={canvas}
          aria-label="Arrangement timeline"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onDoubleClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect(),
              x = e.clientX - r.left,
              y = e.clientY - r.top,
              t = p.tracks[trackAt(y)];
            if (t && x > HEADER && t.type === "midi") {
              const beat = xBeat(x),
                c = t.clips.find(
                  (c) => beat >= c.beat && beat <= c.beat + c.duration,
                );
              if (c) {
                setState({ selectedClips: [c.id], view: "score" });
              } else {
                const clip = newClip({
                  name: "Pattern",
                  beat: Math.max(0, snapped(beat)),
                  color: t.color,
                });
                edit("New pattern", (p) => {
                  p.tracks.find((v) => v.id === t.id)!.clips.push(clip);
                });
              }
            }
          }}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              setState({
                zoom: clamp(s.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 4, 240),
              });
            } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
              setState({
                scroll: Math.max(0, scroll + (e.deltaX || e.deltaY) / s.zoom),
              });
            } else
              setVertical(
                clamp(
                  vertical + e.deltaY,
                  0,
                  Math.max(0, p.tracks.length * ROW - size.height + TOP),
                ),
              );
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top;
            const track = y >= TOP ? p.tracks[trackAt(y)] : undefined;
            if (!track) { setMenu(null); return; }
            if (x < HEADER) {
              setState({ selectedTrack: track.id, selectedClips: [], selectedNotes: [] });
              setMenu({ x: e.clientX, y: e.clientY, trackId: track.id });
              return;
            }
            const beat = xBeat(x);
            const clip = [...track.clips].reverse().find((c) => beat >= c.beat && beat <= c.beat + c.duration);
            if (!clip) { setMenu(null); return; }
            setState({ selectedTrack: track.id, selectedClips: s.selectedClips.includes(clip.id) ? s.selectedClips : [clip.id], selectedNotes: [] });
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        />
        <canvas ref={playhead} className="playhead" />
        {p.tracks.length === 0 && (
          <div className="empty-canvas">
            Add a track or drop audio to start arranging.
          </div>
        )}
      </div>
      <div className="timeline-scroll">
        <span>{Math.floor(scroll / bars(p)) + 1}</span>
        <input
          aria-label="Timeline horizontal scroll"
          type="range"
          min="0"
          max={Math.max(1, endBeat(p) + 32 - visible)}
          step="0.1"
          value={scroll}
          onChange={(e) => setState({ scroll: +e.target.value })}
        />
        <span>{Math.ceil(endBeat(p) / bars(p))} bars</span>
      </div>
      {menu?.trackId ? (
        <StudioTrackMenu trackId={menu.trackId} position={menu} close={() => setMenu(null)} />
      ) : menu && (
        <StudioContextMenu position={menu} label="Clip actions" close={() => setMenu(null)}>
          {[
            ["Split at cursor", () => split()],
            ["Duplicate", () => paste("clips", true)],
            [
              "Mute / unmute",
              () =>
                edit("Mute clips", (p) => {
                  for (const t of p.tracks)
                    for (const c of t.clips)
                      if (s.selectedClips.includes(c.id)) c.muted = !c.muted;
                }),
            ],
            ["Delete clips", () => deleteSelected()],
          ].map(([label, fn]) => (
            <button
              role="menuitem"
              key={String(label)}
              onClick={() => {
                (fn as () => void)();
                setMenu(null);
              }}
            >
              {String(label)}
            </button>
          ))}
        </StudioContextMenu>
      )}
    </section>
  );
}
