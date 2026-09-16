import { useEffect, useRef, useState } from "react";
import { Film, Play, Pause, Plus, Trash2, Download } from "lucide-react";
import {
  useStudio,
  edit,
  report,
  setState,
  refreshAssets,
  save,
  getState,
} from "./store";
import { browserRender } from "./export";
import { id } from "./model";
import { queueVisual, visualUrl } from "./visualActions";
import type { VideoDesign, VideoScene } from "./visual-model";
import {
  drawVideoPreview,
  videoDimensions as dimensions,
  type PreviewMedia,
} from "./video-preview";
export function VideoComposer({
  alignmentAvailable,
}: {
  alignmentAvailable: boolean;
}) {
  const s = useStudio(),
    p = s.project!,
    d = p.visuals.video,
    timing = p.visuals.timing;
  const source =
    s.assets.find((a) => a.id === d.audioAssetId) ??
    s.assets.find(
      (a) =>
        a.id ===
        p.candidates.find((c) => c.id === p.creative.selectedCandidateId)
          ?.assetId,
    ) ??
    s.assets[0];
  const [advanced, setAdvanced] = useState(true),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    context = useRef<AudioContext | null>(null),
    analyser = useRef<AnalyserNode | null>(null),
    images = useRef(new Map<string, PreviewMedia>());
  const current = useRef({ p, d, timing });
  current.current = { p, d, timing };
  const [w, h, fps] = dimensions[d.preset];
  const duration = source
    ? Math.min(
        d.duration ?? source.duration - d.start,
        source.duration - d.start,
      )
    : 30;
  const scene = d.scenes.find((x) => x.id === selected);
  useEffect(() => {
    for (const a of p.visuals.assets) {
      if (images.current.has(a.id)) continue;
      const media =
        a.kind === "video" ? document.createElement("video") : new Image();
      if (media instanceof HTMLVideoElement) {
        media.muted = true;
        media.loop = true;
        media.preload = "auto";
        media.playsInline = true;
      }
      media.src = visualUrl(p.id, a.id);
      images.current.set(a.id, media);
    }
  }, [p.visuals.assets]);
  useEffect(() => {
    let frame: number;
    const element = audio.current;
    const draw = () => {
      const node = canvas.current;
      if (node)
        drawVideoPreview(
          node,
          current.current.p,
          audio.current?.currentTime ?? 0,
          images.current,
          analyser.current,
          !audio.current?.paused,
          audio.current?.duration || 30,
        );
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      element?.pause();
      for (const media of images.current.values())
        if (media instanceof HTMLVideoElement) {
          media.pause();
          media.removeAttribute("src");
          media.load();
        }
      void context.current?.close();
      context.current = null;
      analyser.current = null;
    };
  }, []);
  const play = async () => {
    if (!audio.current) return;
    if (playing) {
      audio.current.pause();
      return;
    }
    if (!context.current) {
      context.current = new AudioContext();
      analyser.current = context.current.createAnalyser();
      analyser.current.fftSize = 2048;
      const input = context.current.createMediaElementSource(audio.current);
      input.connect(analyser.current);
      analyser.current.connect(context.current.destination);
    }
    await context.current.resume();
    await audio.current.play();
  };
  const set = <K extends keyof VideoDesign>(key: K, value: VideoDesign[K]) =>
    edit("Video " + key, (p) => {
      p.visuals.video[key] = value;
    });
  const add = (type: VideoScene["type"]) => {
    const next: VideoScene = {
      id: id(),
      type,
      start: Math.min(
        Math.max(0, time),
        Math.max(0, (source?.duration ?? 30) - 0.1),
      ),
      end: Math.min(source?.duration ?? 30, Math.max(0, time) + 10),
      assetId: d.backgroundId,
      text: type === "title" ? p.name : "Your text",
      color: "#ffffff",
      opacity: 1,
      x: 0.5,
      y: 0.5,
      size: ["image", "video", "color"].includes(type) ? 1 : 0.8,
      motion: "still",
      fade: 0.5,
    };
    edit("Add video scene", (p) => {
      p.visuals.video.scenes.push(next);
    });
    setSelected(next.id);
  };
  const updateScene = <K extends keyof VideoScene>(
    key: K,
    value: VideoScene[K],
  ) =>
    edit("Edit scene", (p) => {
      const scene = p.visuals.video.scenes.find((x) => x.id === selected);
      if (scene) {
        if (typeof value === "number") {
          const max =
            key === "fade" ? 5 : ["start", "end"].includes(key) ? 1200 : 1;
          const min = key === "size" ? 0.05 : 0;
          value = Math.max(min, Math.min(max, value)) as VideoScene[K];
          if (key === "start")
            value = Math.min(Number(value), scene.end - 0.05) as VideoScene[K];
          if (key === "end")
            value = Math.max(
              Number(value),
              scene.start + 0.05,
            ) as VideoScene[K];
        }
        scene[key] = value;
      }
    });
  const missing =
    timing.lines.some((l) => l.start === null) ||
    !timing.lines.length ||
    timing.assetId !== source?.id ||
    timing.needsReview;
  return (
    <div className="video-composer">
      <section className="visual-controls">
        <div className="section-heading">
          <h2>Music video</h2>
          <button
            className={advanced ? "active" : ""}
            onClick={() => setAdvanced(!advanced)}
          >
            Advanced
          </button>
        </div>
        <label className="field">
          <span>Audio source</span>
          <select
            value={source?.id ?? ""}
            onChange={(e) => set("audioAssetId", e.target.value)}
          >
            {s.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!!s.busy}
          onClick={() =>
            void (async () => {
              await save();
              if (getState().dirty)
                throw new Error("Save before rendering your Studio mix.");
              const asset = await browserRender({
                format: "wav",
                sampleRate: 48000,
                bitDepth: 24,
                master: true,
                lufs: -14,
                region: false,
                saveToProject: true,
              });
              if (asset && getState().project?.id === p.id) {
                await refreshAssets();
                edit("Use Studio mix for video", (p) => {
                  p.visuals.video.audioAssetId = asset.id;
                });
              }
            })().catch(report)
          }
        >
          Use the current Studio mix
        </button>
        <label className="field">
          <span>Video type</span>
          <select
            value={d.kind}
            onChange={(e) => set("kind", e.target.value as VideoDesign["kind"])}
          >
            <option value="karaoke">Karaoke · highlight the words</option>
            <option value="lyric">Lyric video · let the words lead</option>
            <option value="visualizer">Visualizer · music in motion</option>
          </select>
        </label>
        <div className="template-choice">
          {(
            ["clean", "classic", "cinematic", "minimal", "visualizer"] as const
          ).map((t) => (
            <button
              key={t}
              className={d.template === t ? "active" : ""}
              onClick={() =>
                edit("Video template", (p) => {
                  p.visuals.video.template = t;
                  p.visuals.video.motion = t === "cinematic" ? "zoom" : "still";
                  p.visuals.video.font = t === "cinematic" ? "serif" : "sans";
                  p.visuals.video.visualizer =
                    t === "visualizer"
                      ? "bars"
                      : t === "minimal"
                        ? "none"
                        : "waveform";
                })
              }
            >
              {t}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Background</span>
          <select
            value={d.backgroundId ?? ""}
            onChange={(e) => set("backgroundId", e.target.value || null)}
          >
            <option value="">Solid color</option>
            {p.visuals.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Export size</span>
          <select
            value={d.preset}
            onChange={(e) =>
              set("preset", e.target.value as VideoDesign["preset"])
            }
          >
            <option value="1080p">YouTube · 1080p / 30</option>
            <option value="1080p60">1080p / 60</option>
            <option value="vertical">Shorts / Reels / TikTok · vertical</option>
            <option value="square">Square social · 1080 × 1080</option>
            <option value="1440p">1440p</option>
            <option value="4k">4K</option>
          </select>
        </label>
        {d.kind !== "visualizer" && missing && (
          <div className="timing-required">
            <strong>Give the lyrics their timing.</strong>
            <p>Align, listen and correct before rendering.</p>
            <button
              disabled={
                !source || !alignmentAvailable || !p.generation.lyrics.trim()
              }
              onClick={() =>
                void queueVisual(
                  "align",
                  { lyrics: p.generation.lyrics, language: "auto" },
                  source?.id,
                ).catch(report)
              }
            >
              Align lyrics
            </button>
            <button onClick={() => setState({ visualsTab: "timing" })}>
              Open timing editor
            </button>
          </div>
        )}
        {advanced && (
          <div className="video-advanced">
            <h3>Composition</h3>
            <div className="simple-options">
              <label className="field">
                <span>Start · seconds</span>
                <input
                  type="number"
                  min="0"
                  value={d.start}
                  onChange={(e) => set("start", +e.target.value)}
                />
              </label>
              <label className="field">
                <span>Length · seconds</span>
                <input
                  type="number"
                  min="1"
                  max="1200"
                  placeholder="Full song"
                  value={d.duration ?? ""}
                  onChange={(e) =>
                    set("duration", e.target.value ? +e.target.value : null)
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>Font</span>
              <select
                value={d.font}
                onChange={(e) =>
                  set("font", e.target.value as VideoDesign["font"])
                }
              >
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
            </label>
            {(
              [
                ["fontSize", "Type size", 20, 160, 1],
                ["lyricY", "Lyric position", 0.15, 0.9, 0.01],
                ["visualizerY", "Visualizer vertical", 0.1, 0.9, 0.01],
                ["visualizerX", "Visualizer horizontal", 0, 1, 0.01],
                ["visualizerSize", "Visualizer width", 0.1, 1, 0.01],
                ["sensitivity", "Sensitivity", 0.1, 3, 0.1],
                ["smoothing", "Smoothing", 0, 0.95, 0.01],
                ["opacity", "Visualizer opacity", 0, 1, 0.01],
                ["thickness", "Line thickness", 1, 12, 1],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={d[key]}
                  onChange={(e) => set(key, +e.target.value)}
                />
              </label>
            ))}
            <label className="field">
              <span>Visualizer</span>
              <select
                value={d.visualizer}
                onChange={(e) =>
                  set("visualizer", e.target.value as VideoDesign["visualizer"])
                }
              >
                {[
                  "none",
                  "waveform",
                  "mirrored",
                  "bars",
                  "circle",
                  "scope",
                  "particles",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Background motion</span>
              <select
                value={d.motion}
                onChange={(e) =>
                  set("motion", e.target.value as VideoDesign["motion"])
                }
              >
                {["still", "zoom", "pan"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <div className="simple-options">
              {(["color", "highlight", "background"] as const).map((key) => (
                <label className="field" key={key}>
                  <span>{key}</span>
                  <input
                    type="color"
                    value={d[key]}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={d.intro}
                onChange={(e) => set("intro", e.target.checked)}
              />
              Title / artist intro
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={d.beatPulse}
                onChange={(e) => set("beatPulse", e.target.checked)}
              />
              Subtle audio-energy pulse
            </label>
            <label className="field">
              <span>Encoder</span>
              <select
                value={d.encoder}
                onChange={(e) =>
                  set("encoder", e.target.value as VideoDesign["encoder"])
                }
              >
                <option value="h264">MP4 · H.264 + AAC 320 kbps</option>
                <option value="hevc">MP4 · HEVC + AAC 320 kbps</option>
                <option value="webm">WebM · VP9 + Opus</option>
                <option value="av1">WebM · AV1 + Opus</option>
                <option value="archive">MKV · lossless FFV1 + FLAC</option>
              </select>
            </label>
            <label className="field">
              <span>Video quality · CRF {d.crf}</span>
              <input
                type="range"
                min="12"
                max="30"
                value={d.crf}
                onChange={(e) => set("crf", +e.target.value)}
              />
            </label>
          </div>
        )}
        <button
          className="primary wide"
          disabled={!source || (d.kind !== "visualizer" && missing)}
          onClick={() =>
            void queueVisual("video", {
              design: { ...d, audioAssetId: source!.id },
            }).catch(report)
          }
        >
          <Film size={16} />
          Render{" "}
          {d.kind === "karaoke"
            ? "karaoke video"
            : d.kind === "lyric"
              ? "lyric video"
              : "visualizer"}
        </button>
        <small>
          Server render · {w} × {h} · {fps} fps
        </small>
        <p className="help">Original audio stays separate. No watermark.</p>
      </section>
      <section className="video-stage">
        <div className="composition-preview">
          <canvas
            ref={canvas}
            aria-label="Video composition preview"
            style={{ aspectRatio: `${w}/${h}` }}
          />
        </div>
        <div className="preview-transport">
          <button
            disabled={!source}
            aria-label={playing ? "Pause video preview" : "Play video preview"}
            onClick={() => void play().catch(report)}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <input
            aria-label="Video preview position"
            type="range"
            min="0"
            max={source?.duration ?? 1}
            step=".01"
            value={time}
            onChange={(e) => {
              setTime(+e.target.value);
              if (audio.current) audio.current.currentTime = +e.target.value;
            }}
          />
          <span className="timecode">{time.toFixed(2)}s</span>
          <audio
            ref={audio}
            src={source ? "/api/assets/" + source.id + "/audio" : undefined}
            preload="metadata"
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>
        <p className="preview-note">
          Live composition preview. Final renders include full-resolution motion
          and transitions.
        </p>
        {advanced && (
          <div className="video-timeline">
            <div className="section-heading">
              <h3>Scenes & overlays</h3>
              <select
                aria-label="Add video scene"
                value=""
                onChange={(e) => {
                  if (e.target.value) add(e.target.value as VideoScene["type"]);
                }}
              >
                <option value="">+ Add scene</option>
                {[
                  "image",
                  "video",
                  "color",
                  "text",
                  "title",
                  "lyrics",
                  "waveform",
                  "spectrum",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="video-section-markers">
              {p.sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => {
                    const t = (section.beat * 60) / p.tempo;
                    setTime(t);
                    if (audio.current) audio.current.currentTime = t;
                  }}
                >
                  {section.name} · {((section.beat * 60) / p.tempo).toFixed(1)}s
                </button>
              ))}
            </div>
            <div className="scene-lanes">
              {d.scenes.map((scene) => (
                <button
                  className={scene.id === selected ? "selected" : ""}
                  key={scene.id}
                  onClick={() => setSelected(scene.id)}
                >
                  <span>{scene.type}</span>
                  <div
                    className="scene-bar"
                    style={{
                      marginLeft: `${(scene.start / Math.max(1, source?.duration ?? 30)) * 75}%`,
                      width: `${((scene.end - scene.start) / Math.max(1, source?.duration ?? 30)) * 75}%`,
                    }}
                  >
                    {scene.text || scene.type}
                  </div>
                  <small>
                    {scene.start.toFixed(1)}–{scene.end.toFixed(1)}
                  </small>
                </button>
              ))}
            </div>
            {scene && (
              <div className="scene-editor">
                <strong>{scene.type} scene</strong>
                {(
                  ["start", "end", "x", "y", "size", "opacity", "fade"] as const
                ).map((key) => (
                  <label key={key}>
                    {key}
                    <input
                      type="number"
                      min={key === "size" ? 0.05 : 0}
                      max={
                        key === "fade"
                          ? 5
                          : ["start", "end"].includes(key)
                            ? 1200
                            : 1
                      }
                      step=".1"
                      value={scene[key]}
                      onChange={(e) => updateScene(key, +e.target.value)}
                    />
                  </label>
                ))}
                {["image", "video"].includes(scene.type) && (
                  <select
                    aria-label="Scene media"
                    value={scene.assetId ?? ""}
                    onChange={(e) =>
                      updateScene("assetId", e.target.value || null)
                    }
                  >
                    <option value="">Choose media</option>
                    {p.visuals.assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                {["text", "title"].includes(scene.type) && (
                  <input
                    aria-label="Scene text"
                    value={scene.text}
                    onChange={(e) => updateScene("text", e.target.value)}
                  />
                )}
                <input
                  aria-label="Scene color"
                  type="color"
                  value={scene.color}
                  onChange={(e) => updateScene("color", e.target.value)}
                />
                <button
                  aria-label="Delete scene"
                  onClick={() =>
                    edit("Remove video scene", (p) => {
                      p.visuals.video.scenes = p.visuals.video.scenes.filter(
                        (x) => x.id !== scene.id,
                      );
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        )}
        <div className="video-renders">
          <h3>Rendered videos</h3>
          {p.visuals.assets
            .filter((a) => a.kind === "video" && a.jobId)
            .map((a) => (
              <div key={a.id}>
                <video
                  controls
                  preload="metadata"
                  src={visualUrl(p.id, a.id)}
                />
                <span>{a.name}</span>
                <a className="button" href={visualUrl(p.id, a.id)} download>
                  <Download size={14} />
                  Download
                </a>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
