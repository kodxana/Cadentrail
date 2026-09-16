import { useEffect, useRef, useState } from "react";
import { Plus, Power, Trash2, ArrowUp, RotateCcw } from "lucide-react";
import {
  useStudio,
  setState,
  edit,
  beginGesture,
  preview,
  finishGesture,
} from "./store";
import {
  id,
  db,
  clamp,
  effectDefaults,
  type EffectType,
  type Track,
  type Project,
  type Point,
} from "./model";
import { engine, automationValue } from "./audio";
import { useSize, setupCanvas } from "./Canvas";
const effectNames: Record<EffectType, string> = {
  eq: "Parametric EQ",
  highpass: "High-pass",
  lowpass: "Low-pass",
  compressor: "Compressor",
  limiter: "Peak compressor",
  delay: "Delay",
  reverb: "Reverb",
  saturation: "Saturation",
  width: "Stereo width",
  gain: "Utility gain",
  gate: "Soft gate",
  chorus: "Chorus",
};
export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  update,
  vertical = false,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  update: (p: Project, v: number) => void;
  vertical?: boolean;
}) {
  const dragging = useRef(false);
  return (
    <input
      className={vertical ? "fader" : ""}
      type="range"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onPointerDown={() => {
        dragging.current = true;
        beginGesture();
      }}
      onChange={(e) => {
        const v = +e.target.value;
        if (dragging.current) preview((p) => update(p, v));
        else edit(label, (p) => update(p, v));
      }}
      onPointerUp={() => {
        dragging.current = false;
        finishGesture(label);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        finishGesture(label);
      }}
    />
  );
}
export function Meter({
  trackId,
  master = false,
}: {
  trackId?: string;
  master?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame: number,
      previous = 0;
    const draw = (time: number) => {
      if (ref.current && time - previous > 45) {
        previous = time;
        const canvas = ref.current,
          ctx = setupCanvas(canvas, 16, 156);
        ctx.fillStyle = "#191d25";
        ctx.fillRect(0, 0, 16, 156);
        const m = master
          ? {
              peak: Math.max(...engine.meter.peak),
              rms: Math.max(...engine.meter.rms),
            }
          : engine.trackMeter(trackId!);
        const level = (v: number) =>
          clamp((20 * Math.log10(Math.max(v, 1e-6)) + 60) / 60, 0, 1);
        const rms = level(m.rms),
          peak = level(m.peak);
        ctx.fillStyle =
          m.peak >= 0.999 ? "#ef6d6d" : m.peak > 0.85 ? "#e5bc75" : "#80caab";
        ctx.fillRect(2, 156 - rms * 156, 12, rms * 156);
        ctx.fillStyle = "#d8e7dd";
        ctx.fillRect(2, 156 - peak * 156, 12, 2);
      }
      frame = requestAnimationFrame(draw);
    };
    draw(0);
    return () => cancelAnimationFrame(frame);
  }, [trackId, master]);
  return (
    <canvas
      ref={ref}
      aria-label={master ? "Master level meter" : "Track level meter"}
    />
  );
}
export function Mixer() {
  const s = useStudio(),
    p = s.project!;
  return (
    <section className="workspace">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">THE MIX</span>
          <h2>Mixer</h2>
        </div>
        <span className="help">Signal: inserts → gain → pan → output</span>
      </div>
      <div className="mixer-channels">
        {p.tracks
          .filter((t) => !["lyrics", "chord", "automation"].includes(t.type))
          .map((t) => (
            <div
              className={
                "channel " + (s.selectedTrack === t.id ? "selected" : "")
              }
              key={t.id}
              style={{ "--track-color": t.color } as React.CSSProperties}
              onClick={() => setState({ selectedTrack: t.id })}
            >
              <div className="channel-header">
                <span className="channel-type">{t.type.toUpperCase()}</span>
                <input
                  aria-label="Track name"
                  value={t.name}
                  onChange={(e) =>
                    edit("Rename track", (p) => {
                      p.tracks.find((x) => x.id === t.id)!.name =
                        e.target.value;
                    })
                  }
                />
              </div>
              <div className="channel-inserts">
                {t.effects.slice(0, 4).map((f) => (
                  <span className={f.bypass ? "bypassed" : ""} key={f.id}>
                    {effectNames[f.type]}
                  </span>
                ))}
                {t.effects.length === 0 && (
                  <span className="dim">No inserts</span>
                )}
              </div>
              <div className="pan-control">
                <span>L</span>
                <Slider
                  value={t.pan}
                  min={-1}
                  max={1}
                  label={t.name + " pan"}
                  update={(p, v) => {
                    p.tracks.find((x) => x.id === t.id)!.pan = v;
                  }}
                />
                <span>R</span>
              </div>
              <div className="channel-buttons">
                <button
                  className={t.mute ? "mute active" : ""}
                  onClick={() =>
                    edit("Mute", (p) => {
                      p.tracks.find((x) => x.id === t.id)!.mute = !t.mute;
                    })
                  }
                >
                  M
                </button>
                <button
                  className={t.solo ? "active" : ""}
                  onClick={() =>
                    edit("Solo", (p) => {
                      p.tracks.find((x) => x.id === t.id)!.solo = !t.solo;
                    })
                  }
                >
                  S
                </button>
              </div>
              <div className="fader-area">
                <span className="fader-scale">
                  +6
                  <br />0<br />
                  −12
                  <br />
                  −24
                  <br />
                  −∞
                </span>
                <Slider
                  vertical
                  value={t.volume}
                  max={2}
                  label={t.name + " volume"}
                  update={(p, v) => {
                    p.tracks.find((x) => x.id === t.id)!.volume = v;
                  }}
                />
                <Meter trackId={t.id} />
              </div>
              <strong className="gain-readout">
                {db(t.volume)} <small>dB</small>
              </strong>
              <select
                aria-label={t.name + " output"}
                value={t.output}
                onChange={(e) =>
                  edit("Output routing", (p) => {
                    p.tracks.find((x) => x.id === t.id)!.output =
                      e.target.value;
                  })
                }
              >
                <option value="master">Master</option>
                {p.tracks
                  .filter(
                    (bus) =>
                      bus.type === "bus" &&
                      bus.id !== t.id &&
                      bus.output !== t.id,
                  )
                  .map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.name}
                    </option>
                  ))}
              </select>
            </div>
          ))}
        <div className="channel master-channel">
          <div className="channel-header">
            <span className="eyebrow">OUTPUT</span>
            <h3>Master</h3>
          </div>
          <div className="channel-inserts">
            <span>48 kHz · stereo</span>
            <span className="dim">Sample peak meter</span>
          </div>
          <div className="master-mark">Σ</div>
          <div className="fader-area">
            <span className="fader-scale">
              +6
              <br />0<br />
              −12
              <br />
              −24
              <br />
              −∞
            </span>
            <Slider
              vertical
              value={p.masterVolume}
              max={2}
              label="Master volume"
              update={(p, v) => {
                p.masterVolume = v;
              }}
            />
            <Meter master />
          </div>
          <strong className="gain-readout">
            {db(p.masterVolume)} <small>dB</small>
          </strong>
          <span className="dim centered">Browser output</span>
        </div>
      </div>
      <AutomationEditor />
    </section>
  );
}
const ranges: Record<string, [number, number, number]> = {
  frequency: [20, 20000, 1],
  gain: [-24, 24, 0.1],
  q: [0.1, 20, 0.1],
  threshold: [-80, 0, 1],
  ratio: [1, 20, 0.1],
  attack: [0.001, 1, 0.001],
  release: [0.01, 1, 0.01],
  knee: [0, 40, 1],
  time: [0.01, 4, 0.01],
  feedback: [0, 0.9, 0.01],
  mix: [0, 1, 0.01],
  decay: [0.1, 8, 0.1],
  drive: [1, 20, 0.1],
  width: [0, 2, 0.01],
  rate: [0.05, 10, 0.05],
  depth: [0, 0.015, 0.0005],
};
export function Effects() {
  const s = useStudio(),
    t = s.project?.tracks.find((t) => t.id === s.selectedTrack);
  const [add, setAdd] = useState<EffectType>("eq");
  if (!t) return <p className="help">Select a track to shape its sound.</p>;
  return (
    <div className="effects">
      <div className="inspector-heading">
        <span>INSERT EFFECTS</span>
        <span>{t.effects.length}/24</span>
      </div>
      <div className="effect-add">
        <select
          aria-label="New effect"
          value={add}
          onChange={(e) => setAdd(e.target.value as EffectType)}
        >
          {Object.entries(effectNames).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
        <button
          title="Add effect"
          disabled={t.effects.length >= 24}
          onClick={() =>
            edit("Add effect", (p) => {
              p.tracks
                .find((x) => x.id === t.id)!
                .effects.push({
                  id: id(),
                  type: add,
                  bypass: false,
                  params: { ...effectDefaults[add] },
                });
            })
          }
        >
          <Plus size={14} />
        </button>
      </div>
      {t.effects.map((f, i) => (
        <div className={"effect " + (f.bypass ? "bypassed" : "")} key={f.id}>
          <div className="effect-title">
            <button
              title="Bypass"
              onClick={() =>
                edit("Bypass effect", (p) => {
                  p.tracks.find((x) => x.id === t.id)!.effects[i].bypass =
                    !f.bypass;
                })
              }
            >
              <Power size={12} />
            </button>
            <strong>{effectNames[f.type]}</strong>
            <div className="spacer" />
            <button
              title="Move effect up"
              disabled={!i}
              onClick={() =>
                edit("Reorder effect", (p) => {
                  const a = p.tracks.find((x) => x.id === t.id)!.effects;
                  [a[i - 1], a[i]] = [a[i], a[i - 1]];
                })
              }
            >
              <ArrowUp size={12} />
            </button>
            <button
              title="Reset"
              onClick={() =>
                edit("Reset effect", (p) => {
                  p.tracks.find((x) => x.id === t.id)!.effects[i].params = {
                    ...effectDefaults[f.type],
                  };
                })
              }
            >
              <RotateCcw size={12} />
            </button>
            <button
              title="Remove effect"
              onClick={() =>
                edit("Remove effect", (p) => {
                  p.tracks.find((x) => x.id === t.id)!.effects.splice(i, 1);
                })
              }
            >
              <Trash2 size={12} />
            </button>
          </div>
          {Object.entries(f.params)
            .filter(([key]) => !(f.type === "gate" && key === "release"))
            .map(([key, value]) => {
              const [min, max, step] =
                f.type === "gain"
                  ? [0, 4, 0.01]
                  : (ranges[key] ?? [0, 1, 0.01]);
              return (
                <label className="effect-param" key={key}>
                  <span>{key}</span>
                  <Slider
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    label={effectNames[f.type] + " " + key}
                    update={(p, v) => {
                      p.tracks.find((x) => x.id === t.id)!.effects[i].params[
                        key
                      ] = v;
                    }}
                  />
                  <output>
                    {value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}
                  </output>
                </label>
              );
            })}
          {f.type === "limiter" && (
            <p className="help">
              Fast compressor. Final true-peak limiting is available in
              mastering export.
            </p>
          )}
          {f.type === "gate" && (
            <p className="help">
              Static soft gate; no lookahead or timed release.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
export function AutomationEditor() {
  const s = useStudio(),
    p = s.project!,
    t = p.tracks.find((t) => t.id === s.selectedTrack);
  const [param, setParam] = useState<"volume" | "pan">("volume"),
    [selected, setSelected] = useState<string[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null),
    [host, size] = useSize<HTMLDivElement>(),
    drag = useRef<{ beat: number; value: number; points: Point[] } | null>(
      null,
    ),
    clipboard = useRef<Point[]>([]);
  const a = t?.automation.find((a) => a.parameter === param),
    length = Math.max(p.loopEnd, 16),
    low = param === "pan" ? -1 : 0,
    high = param === "pan" ? 1 : 2;
  const xy = (beat: number, value: number) => [
    44 + (beat / length) * (size.width - 64),
    150 - ((value - low) / (high - low)) * 120,
  ];
  useEffect(() => {
    if (!canvas.current) return;
    const ctx = setupCanvas(canvas.current, size.width, 180);
    ctx.fillStyle = "#1c2028";
    ctx.fillRect(0, 0, size.width, 180);
    ctx.font = '10px "DM Sans",system-ui';
    for (let i = 0; i <= 4; i++) {
      const y = 30 + i * 30;
      ctx.strokeStyle = "#343944";
      ctx.beginPath();
      ctx.moveTo(44, y);
      ctx.lineTo(size.width - 20, y);
      ctx.stroke();
      ctx.fillStyle = "#a4a8b0";
      ctx.fillText((high - (i / 4) * (high - low)).toFixed(1), 8, y + 4);
    }
    for (let b = 0; b <= length; b += 4) {
      const [x] = xy(b, 0);
      ctx.fillStyle = "#a4a8b0";
      ctx.fillText(String(b), x, 173);
    }
    ctx.strokeStyle = t?.color ?? "#81caae";
    ctx.beginPath();
    const points = a?.points ?? [];
    for (let b = 0; b <= length; b += length / 500) {
      const [x, y] = xy(
        b,
        automationValue(
          points,
          b,
          param === "volume" ? (t?.volume ?? 0.8) : (t?.pan ?? 0),
          a?.interpolation === "step",
        ),
      );
      if (b === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (const point of points) {
      const [x, y] = xy(point.beat, point.value);
      ctx.fillStyle = selected.includes(point.id)
        ? "#f4f1ed"
        : (t?.color ?? "#81caae");
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [t, a, param, size, selected, length]);
  return (
    <div className="automation-editor">
      <div className="toolbar">
        <span className="eyebrow">
          AUTOMATION · {t?.name ?? "SELECT A TRACK"}
        </span>
        <select
          aria-label="Automation parameter"
          value={param}
          onChange={(e) => setParam(e.target.value as typeof param)}
        >
          <option value="volume">Volume</option>
          <option value="pan">Pan</option>
        </select>
        <select
          aria-label="Automation interpolation"
          value={a?.interpolation ?? "linear"}
          onChange={(e) =>
            edit("Automation interpolation", (p) => {
              const lane = p.tracks
                .find((x) => x.id === t?.id)
                ?.automation.find((a) => a.parameter === param);
              if (lane)
                lane.interpolation = e.target.value as "linear" | "step";
            })
          }
        >
          <option value="linear">Linear</option>
          <option value="step">Step</option>
        </select>
        <button
          aria-label="Delete selected automation points"
          onClick={() =>
            edit("Delete automation points", (p) => {
              const lane = p.tracks
                .find((x) => x.id === t?.id)
                ?.automation.find((a) => a.parameter === param);
              if (lane)
                lane.points = lane.points.filter(
                  (p) => !selected.includes(p.id),
                );
            })
          }
        >
          <Trash2 size={13} />
        </button>
        <button onClick={() => setSelected(a?.points.map((p) => p.id) ?? [])}>
          Select all
        </button>
        <button
          onClick={() => {
            clipboard.current = structuredClone(
              a?.points.filter((p) => selected.includes(p.id)) ?? [],
            );
          }}
        >
          Copy
        </button>
        <button
          onClick={() => {
            if (!clipboard.current.length || !t) return;
            const min = Math.min(...clipboard.current.map((p) => p.beat));
            const added = clipboard.current.map((p) => ({
              ...p,
              id: id(),
              beat: p.beat - min + s.cursor,
              value: clamp(p.value, low, high),
            }));
            edit("Paste automation points", (p) => {
              const track = p.tracks.find((x) => x.id === t.id)!;
              let lane = track.automation.find((a) => a.parameter === param);
              if (!lane) {
                lane = {
                  parameter: param,
                  points: [],
                  enabled: true,
                  interpolation: "linear",
                };
                track.automation.push(lane);
              }
              lane.points = [
                ...lane.points.filter(
                  (p) => !added.some((n) => Math.abs(n.beat - p.beat) < 0.001),
                ),
                ...added,
              ].sort((a, b) => a.beat - b.beat);
            });
            setSelected(added.map((p) => p.id));
          }}
        >
          Paste at cursor
        </button>
        <button
          onClick={() =>
            edit("Reset automation", (p) => {
              const track = p.tracks.find((x) => x.id === t?.id);
              if (track)
                track.automation = track.automation.filter(
                  (a) => a.parameter !== param,
                );
            })
          }
        >
          Reset
        </button>
        <div className="spacer" />
        <span className="help">
          Click to add · drag to move · Shift-click to select
        </span>
      </div>
      <div ref={host} className="automation-canvas">
        <canvas
          ref={canvas}
          aria-label="Automation lane"
          onPointerDown={(e) => {
            if (!t) return;
            const r = e.currentTarget.getBoundingClientRect(),
              x = e.clientX - r.left,
              y = e.clientY - r.top;
            const point = a?.points.find((p) => {
              const [px, py] = xy(p.beat, p.value);
              return Math.hypot(x - px, y - py) < 10;
            });
            if (point) {
              const chosen = e.shiftKey
                ? [...new Set([...selected, point.id])]
                : selected.includes(point.id)
                  ? selected
                  : [point.id];
              setSelected(chosen);
              drag.current = {
                beat: point.beat,
                value: point.value,
                points: structuredClone(
                  a!.points.filter((p) => chosen.includes(p.id)),
                ),
              };
              beginGesture();
              e.currentTarget.setPointerCapture(e.pointerId);
            } else {
              const beat =
                Math.round(
                  clamp(((x - 44) / (size.width - 64)) * length, 0, length) /
                    s.grid,
                ) * s.grid;
              edit("Add automation point", (p) => {
                const track = p.tracks.find((v) => v.id === t.id)!;
                let lane = track.automation.find((a) => a.parameter === param);
                if (!lane) {
                  lane = {
                    parameter: param,
                    points: [],
                    enabled: true,
                    interpolation: "linear",
                  };
                  track.automation.push(lane);
                }
                lane.points = lane.points.filter(
                  (p) => Math.abs(p.beat - beat) > 0.001,
                );
                lane.points.push({
                  id: id(),
                  beat,
                  value: clamp(
                    low + ((150 - y) / 120) * (high - low),
                    low,
                    high,
                  ),
                });
                lane.points.sort((a, b) => a.beat - b.beat);
              });
            }
          }}
          onPointerMove={(e) => {
            if (!drag.current || !t) return;
            const r = e.currentTarget.getBoundingClientRect(),
              beat =
                Math.round(
                  clamp(
                    ((e.clientX - r.left - 44) / (size.width - 64)) * length,
                    0,
                    length,
                  ) / s.grid,
                ) * s.grid,
              value = clamp(
                low + ((150 - (e.clientY - r.top)) / 120) * (high - low),
                low,
                high,
              );
            preview((p) => {
              const lane = p.tracks
                .find((x) => x.id === t.id)!
                .automation.find((a) => a.parameter === param)!;
              const d = drag.current!;
              const db = clamp(
                beat - d.beat,
                -Math.min(...d.points.map((p) => p.beat)),
                length - Math.max(...d.points.map((p) => p.beat)),
              );
              const dv = clamp(
                value - d.value,
                low - Math.min(...d.points.map((p) => p.value)),
                high - Math.max(...d.points.map((p) => p.value)),
              );
              const moved = d.points.map((p) => ({
                ...p,
                beat: p.beat + db,
                value: p.value + dv,
              }));
              lane.points = [
                ...lane.points.filter(
                  (p) =>
                    !moved.some(
                      (n) => n.id === p.id || Math.abs(n.beat - p.beat) < 0.001,
                    ),
                ),
                ...moved,
              ].sort((a, b) => a.beat - b.beat);
            });
          }}
          onPointerUp={() => {
            if (drag.current) finishGesture("Move automation point");
            drag.current = null;
          }}
        />
      </div>
    </div>
  );
}
