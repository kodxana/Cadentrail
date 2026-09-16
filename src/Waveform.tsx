import { useEffect, useRef, useState } from "react";
import {
  useStudio,
  selectedClip,
  edit,
  setState,
  report,
  copy,
  paste,
} from "./store";
import { type Peaks, type Clip, clamp, id } from "./model";
import { api } from "./api";
import { engine } from "./audio";
import { splitClip } from "./editing";
import { useSize, setupCanvas } from "./Canvas";

export function Waveform() {
  const s = useStudio(),
    p = s.project!,
    c = selectedClip();
  const asset = s.assets.find((a) => a.id === c?.assetId);
  const [host, size] = useSize<HTMLDivElement>(),
    canvas = useRef<HTMLCanvasElement>(null),
    playhead = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null),
    [zoom, setZoom] = useState(1),
    [scroll, setScroll] = useState(0),
    [range, setRange] = useState<[number, number]>([0, 1]);
  const anchor = useRef<number | null>(null),
    [samples, setSamples] = useState<AudioBuffer | null>(null);
  const seconds = c ? (c.duration * 60) / p.tempo : 1,
    visible = seconds / zoom,
    left = clamp(scroll, 0, Math.max(0, seconds - visible));
  useEffect(() => {
    setRange([0, seconds]);
    setScroll(0);
    setZoom(1);
  }, [c?.id]);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      if (playhead.current && c) {
        const g = setupCanvas(playhead.current, size.width, 240);
        g.clearRect(0, 0, size.width, 240);
        const time = ((engine.beat() - c.beat) * 60) / p.tempo,
          x = ((time - left) / visible) * size.width;
        g.strokeStyle = "#ede9e1";
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 220);
        g.stroke();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [c?.beat, left, visible, size, p.tempo]);
  useEffect(() => {
    setPeaks(null);
    if (asset)
      void api<Peaks>(`/assets/${asset.id}/peaks?points=50000`)
        .then(setPeaks)
        .catch(report);
  }, [asset?.id]);
  useEffect(() => {
    let stale = false;
    setSamples(null);
    if (c?.assetId && visible < 0.4) {
      const start = c.reverse
        ? c.offset + seconds - left - visible
        : c.offset + left;
      void engine
        .buffer(c.assetId, Math.max(0, start), visible, c.reverse)
        .then((b) => {
          if (!stale) setSamples(b);
        })
        .catch(report);
    }
    return () => {
      stale = true;
    };
  }, [c?.assetId, c?.reverse, c?.offset, left, visible]);
  useEffect(() => {
    if (!canvas.current || !c) return;
    const g = setupCanvas(canvas.current, size.width, 240),
      w = size.width;
    g.fillStyle = "#1c2028";
    g.fillRect(0, 0, w, 240);
    const x = (time: number) => ((time - left) / visible) * w;
    g.fillStyle = "#ffffff17";
    g.fillRect(x(range[0]), 0, x(range[1]) - x(range[0]), 240);
    for (let ch = 0; ch < 2; ch++) {
      const center = 55 + ch * 110;
      g.strokeStyle = "#343944";
      g.beginPath();
      g.moveTo(0, center);
      g.lineTo(w, center);
      g.stroke();
      for (let px = 0; px < w; px++) {
        const time = left + (px / w) * visible,
          source = c.offset + (c.reverse ? seconds - time : time);
        let lo = 0,
          hi = 0;
        if (samples) {
          const data = samples.getChannelData(
            Math.min(ch, samples.numberOfChannels - 1),
          );
          const n = Math.min(
            data.length - 1,
            Math.floor((px / w) * data.length),
          );
          lo = hi = data[n];
        } else if (peaks) {
          const step = peaks.hop / peaks.sampleRate,
            start = Math.max(0, Math.floor(source / step));
          const count = Math.max(1, Math.ceil(visible / w / step));
          for (let n = 0; n < count; n++) {
            const pair = peaks.peaks[start + (c.reverse ? -n : n)]?.[ch];
            if (pair) {
              lo = Math.min(lo, pair[0]);
              hi = Math.max(hi, pair[1]);
            }
          }
        }
        g.strokeStyle =
          Math.max(Math.abs(lo), Math.abs(hi)) * c.gain >= 0.9999
            ? "#f18f83"
            : c.color;
        g.beginPath();
        g.moveTo(px, center - lo * c.gain * 45);
        g.lineTo(px, center - hi * c.gain * 45 + (samples ? 1 : 0));
        g.stroke();
      }
      g.fillStyle = "#a4a8b0";
      g.font = "10px DM Sans,system-ui";
      g.fillText(ch ? "R" : "L", 5, center - 39);
    }
    g.fillStyle = "#a4a8b0";
    g.font = "11px DM Sans,system-ui";
    for (let i = 0; i <= 8; i++) {
      const t = left + (visible * i) / 8;
      g.fillText(
        t.toFixed(visible < 1 ? 3 : 1) + "s",
        Math.min(w - 50, (i * w) / 8 + 4),
        236,
      );
    }
  }, [size, peaks, samples, c, left, visible, range, s.cursor]);
  if (!c?.assetId || !asset)
    return (
      <div className="analysis-notes">
        Select an audio clip in Arrange to edit its waveform.
      </div>
    );
  const ordered = (a: number, b: number): [number, number] => [
    Math.max(0, Math.min(a, b)),
    Math.min(seconds, Math.max(a, b)),
  ];
  const isolate = (operation: string) => {
    if (range[1] - range[0] < 0.001) return;
    const from = c.beat + (range[0] * p.tempo) / 60,
      to = c.beat + (range[1] * p.tempo) / 60;
    let selection: Clip | null = null;
    edit(operation + " audio region", (p) => {
      for (const track of p.tracks) {
        const at = track.clips.findIndex((x) => x.id === c.id);
        if (at < 0) continue;
        let middle = structuredClone(c);
        const before: Clip[] = [],
          after: Clip[] = [];
        if (from > c.beat + 0.0001) {
          const [a, b] = splitClip(middle, from, p.tempo);
          before.push(a);
          middle = b;
        }
        if (to < c.beat + c.duration - 0.0001) {
          const [a, b] = splitClip(middle, to, p.tempo);
          middle = a;
          after.push(b);
        }
        if (operation === "Silence") middle.muted = true;
        if (operation === "Reverse") middle.reverse = !middle.reverse;
        if (operation === "Fade in") middle.fadeIn = middle.duration;
        if (operation === "Fade out") middle.fadeOut = middle.duration;
        selection = middle;
        track.clips.splice(
          at,
          1,
          ...(operation === "Trim"
            ? [middle]
            : [...before, ...(operation === "Cut" ? [] : [middle]), ...after]),
        );
      }
    });
    if (selection) setState({ selectedClips: [(selection as Clip).id] });
    if (operation === "Copy") {
      copy("clips");
    }
  };
  const crossing = async () => {
    const pos = range[0],
      start = Math.max(0, pos - 0.01),
      len = Math.min(0.02, seconds - start);
    const buf = await engine.buffer(
      c.assetId!,
      c.reverse ? c.offset + seconds - start - len : c.offset + start,
      len,
      c.reverse,
    );
    const l = buf.getChannelData(0),
      r = buf.getChannelData(Math.min(1, buf.numberOfChannels - 1));
    let best = Math.round((pos - start) * buf.sampleRate),
      distance = Infinity;
    for (let i = 1; i < l.length; i++)
      if ((l[i - 1] + r[i - 1]) * (l[i] + r[i]) <= 0) {
        const d = Math.abs(i / buf.sampleRate + start - pos);
        if (d < distance) {
          distance = d;
          best = i;
        }
      }
    setRange(ordered(start + best / buf.sampleRate, range[1]));
  };
  return (
    <div className="wave-editor">
      <div className="toolbar">
        <span className="eyebrow">WAVEFORM · {c.name}</span>
        <div className="spacer" />
        <label>
          Zoom{" "}
          <input
            aria-label="Waveform zoom"
            type="range"
            min="0"
            max="12"
            step=".25"
            value={Math.log2(zoom)}
            onChange={(e) => setZoom(2 ** +e.target.value)}
          />
        </label>
      </div>
      <div ref={host} style={{ position: "relative" }}>
        <canvas
          ref={canvas}
          style={{ width: "100%", height: 240, touchAction: "none" }}
          role="img"
          aria-label="Stereo audio waveform. Drag to select a region. Red indicates full-scale peaks."
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const r = e.currentTarget.getBoundingClientRect();
            anchor.current = left + ((e.clientX - r.left) / r.width) * visible;
            setRange(ordered(anchor.current, anchor.current));
          }}
          onPointerMove={(e) => {
            if (anchor.current === null) return;
            const r = e.currentTarget.getBoundingClientRect();
            setRange(
              ordered(
                anchor.current,
                left + ((e.clientX - r.left) / r.width) * visible,
              ),
            );
          }}
          onPointerUp={() => {
            anchor.current = null;
          }}
        />
        <canvas
          ref={playhead}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: 240,
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />
      </div>
      <input
        aria-label="Waveform horizontal scroll"
        type="range"
        min="0"
        max={Math.max(0, seconds - visible)}
        step={Math.max(0.0001, visible / 100)}
        value={left}
        onChange={(e) => setScroll(+e.target.value)}
        style={{ width: "100%" }}
      />
      <div className="toolbar compact">
        <label>
          From{" "}
          <input
            type="number"
            aria-label="Region start seconds"
            min="0"
            max={seconds}
            step=".001"
            value={+range[0].toFixed(3)}
            onChange={(e) => setRange(ordered(+e.target.value, range[1]))}
          />
        </label>
        <label>
          To{" "}
          <input
            type="number"
            aria-label="Region end seconds"
            min="0"
            max={seconds}
            step=".001"
            value={+range[1].toFixed(3)}
            onChange={(e) => setRange(ordered(range[0], +e.target.value))}
          />
        </label>
        <button
          onClick={() =>
            void engine.seek(c.beat + (range[0] * p.tempo) / 60).catch(report)
          }
        >
          Set cursor
        </button>
        <button onClick={() => void crossing().catch(report)}>
          Near zero crossing
        </button>
      </div>
      <div className="toolbar compact">
        {[
          "Split",
          "Trim",
          "Copy",
          "Cut",
          "Silence",
          "Reverse",
          "Fade in",
          "Fade out",
        ].map((op) => (
          <button key={op} onClick={() => isolate(op)}>
            {op}
          </button>
        ))}
        <button onClick={() => paste("clips")}>Paste at cursor</button>
        <button
          onClick={() => {
            edit("Normalize clip peak", (p) => {
              for (const t of p.tracks)
                for (const clip of t.clips)
                  if (clip.id === c.id)
                    clip.gain = clamp(
                      10 ** ((-1 - asset.analysis.peakDb) / 20),
                      0,
                      4,
                    );
            });
          }}
        >
          Peak −1 dB
        </button>
      </div>
      <p className="help">
        Edits preserve the original recording. Peak gain uses the whole asset
        measurement. Zero crossing uses the stereo sum; check both channels.{" "}
        {samples ? "Individual samples" : "Cached min/max peaks"}.
      </p>
    </div>
  );
}
