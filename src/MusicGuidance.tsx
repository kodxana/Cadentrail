import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, X, AudioLines, ChevronDown } from "lucide-react";
import { useStudio, getState, setState, edit, notice, report } from "./store";
import { fileApi } from "./api";
import { HelpLink } from "./Help";
import { claimPlayback } from "./playbackFocus";
import { type Asset, type HumSource } from "./model";
import { instrumentalDirection } from "./generationPresentation";

export function MusicAdapterControl() {
  const g = useStudio().project!.generation;
  const instrumental = instrumentalDirection(g);
  return (
    <label className="field">
      <span>Music engine</span>
      <select
        aria-label="Music engine"
        value={g.musicAdapter ?? "auto"}
        onChange={(e) =>
          edit("Choose music engine", (p) => {
            p.generation.musicAdapter = e.target.value as typeof g.musicAdapter;
          })
        }
      >
        <option value="auto">
          Automatic · trained instrumental adapter when needed
        </option>
        <option value="base">Original YuE2 · no instrumental adapter</option>
        {g.musicAdapter === "instrumental-v1" && (
          <option value="instrumental-v1">Instrumental adapter</option>
        )}
      </select>
      <small className="field-hint">
        {instrumental && g.musicAdapter !== "base"
          ? "Uses Mothersuperior’s instrumental adapter. Melody + chords planning is recommended; occasional voice-like sounds can still occur."
          : instrumental
            ? "Uses original YuE2 with a no-vocals prompt; it can still produce voices."
            : "Keeps the original music engine for vocal songs."}{" "}
        Community adapter weights: CC BY-NC 4.0.
      </small>
    </label>
  );
}

const sections = [
  "intro",
  "verse",
  "pre-chorus",
  "chorus",
  "bridge",
  "instrumental",
  "outro",
];
export function InstrumentalForm() {
  const g = useStudio().project!.generation;
  const tags =
    (g.instrumentalSections ?? "[instrumental]").match(
      /\[(intro|verse|pre-chorus|chorus|bridge|instrumental|outro)\]/gi,
    ) ?? [];
  return (
    <div className="instrumental-form">
      <p className="generation-hint">
        Let the instruments tell the story. Your written lyrics stay saved.{" "}
        {g.musicAdapter === "base"
          ? "Original YuE2 is selected in Advanced controls."
          : "The trained instrumental adapter is selected automatically."}
      </p>
      <details className="lyric-tools">
        <summary>
          Shape the arrangement <ChevronDown size={14} />
        </summary>
        <p className="generation-hint">
          Add sections in order. These guide the composition; they do not set
          exact lengths.
        </p>
        <div
          className="instrumental-sequence"
          aria-label="Instrumental arrangement"
        >
          {tags.map((tag, i) => (
            <button
              key={i}
              aria-label={`Remove ${tag.slice(1, -1)} section ${i + 1}`}
              onClick={() =>
                edit("Remove instrumental section", (p) => {
                  p.generation.instrumentalSections = tags
                    .filter((_, n) => n !== i)
                    .join("\n");
                })
              }
            >
              {i + 1} · {tag.slice(1, -1)} <X size={12} />
            </button>
          ))}
        </div>
        <div className="section-chips">
          {sections.map((section) => (
            <button
              key={section}
              disabled={tags.length >= 32}
              onClick={() =>
                edit("Add instrumental section", (p) => {
                  p.generation.instrumentalSections = [
                    ...tags,
                    `[${section}]`,
                  ].join("\n");
                })
              }
            >
              + {section}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

export function HumGuidance() {
  const s = useStudio(),
    p = s.project!,
    hum = p.generation.hum;
  const asset = hum && s.assets.find((a) => a.id === hum.assetId);
  const input = useRef<HTMLInputElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    alive = useRef(true);
  const [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const choose = (a: Asset) => {
    if (a.duration < 3) {
      report("Choose a recording at least three seconds long.");
      return;
    }
    edit("Use hummed melody", (project) => {
      project.generation.hum = {
        assetId: a.id,
        start: 0,
        duration: Math.min(15, a.duration),
        tempo: Math.round(Math.min(240, Math.max(40, project.tempo))),
        mode: "continue",
        influence: 1,
      };
    });
  };
  const upload = async (file: File, projectId: string) => {
    try {
      const a = await fileApi<Asset>(`/projects/${projectId}/import`, file);
      if (getState().project?.id !== projectId || !alive.current) {
        notice("Hum recording saved in its project audio library.");
        return;
      }
      setState({
        assets: [...getState().assets.filter((x) => x.id !== a.id), a],
      });
      choose(a);
    } catch (error) {
      report(error);
    } finally {
      if (alive.current) {
        setBusy(false);
        setRecording(false);
      }
    }
  };
  const record = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setBusy(true);
    const projectId = p.id;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Microphone recording needs HTTPS or localhost and a supported browser. You can upload a recording instead.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || getState().project?.id !== projectId) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      claimPlayback("hum-recording");
      stream.current = media;
      const r = new MediaRecorder(media),
        chunks: BlobPart[] = [];
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        clearTimeout(timer.current);
        media.getTracks().forEach((t) => t.stop());
        if (alive.current) {
          setRecording(false);
          setBusy(true);
        }
        const type = r.mimeType,
          extension = type.includes("ogg")
            ? "ogg"
            : type.includes("mp4")
              ? "m4a"
              : "webm";
        if (chunks.length)
          void upload(
            new File(chunks, "Hummed melody." + extension, { type }),
            projectId,
          );
        else if (alive.current) setBusy(false);
      };
      r.onerror = () => {
        clearTimeout(timer.current);
        media.getTracks().forEach((t) => t.stop());
        if (alive.current) {
          setRecording(false);
          setBusy(false);
        }
        report("The microphone stopped unexpectedly. Try recording again.");
      };
      r.start(250);
      setRecording(true);
      setBusy(false);
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 30000);
    } catch (error) {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (alive.current) setBusy(false);
      report(error);
    }
  };
  const update = (next: Partial<HumSource>) =>
    edit("Adjust hummed melody", (project) => {
      if (project.generation.hum) Object.assign(project.generation.hum, next);
    });
  return (
    <details className="hum-guidance" open={hum ? true : undefined}>
      <summary>
        <AudioLines size={17} />
        <span>
          Start with a hummed melody <small>Optional · experimental</small>
        </span>
        <ChevronDown size={14} />
      </summary>
      <p className="generation-hint">
        Hum a clear solo melody for 3–30 seconds, without backing music. It
        guides the opening melody and phrasing; it does not clone your voice or
        guarantee an exact performance.
      </p>
      <HelpLink topic="hum">Hum-to-Song guide</HelpLink>
      <div className="hum-actions">
        <button
          onClick={() => void record()}
          disabled={busy}
          aria-pressed={recording}
        >
          {recording ? <Square size={15} /> : <Mic size={15} />}
          {recording ? "Stop recording" : "Record hum"}
        </button>
        <button
          disabled={busy || recording}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
          Upload hum
        </button>
        <input
          ref={input}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
              setBusy(true);
              void upload(file, p.id);
            }
          }}
        />
        {hum && (
          <button
            disabled={busy || recording}
            onClick={() =>
              edit("Detach hummed melody", (project) => {
                project.generation.hum = null;
              })
            }
          >
            <X size={14} />
            Detach
          </button>
        )}
      </div>
      <div role="status" className="generation-hint">
        {recording
          ? "Recording… stops automatically after 30 seconds."
          : busy
            ? "Saving your recording…"
            : "Hum-to-Song is an optional 422 MB model download. You will be asked before it downloads."}
      </div>
      {s.assets.some((a) => a.duration >= 3) && (
        <label className="field">
          <span>Or choose project audio</span>
          <select
            aria-label="Hum recording"
            disabled={busy || recording}
            value={hum?.assetId ?? ""}
            onChange={(e) => {
              const a = s.assets.find((x) => x.id === e.target.value);
              if (a) choose(a);
            }}
          >
            <option value="">Choose a solo recording</option>
            {s.assets
              .filter((a) => a.duration >= 3)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {hum && asset && (
        <>
          <audio
            controls
            preload="metadata"
            aria-label="Preview hum recording"
            src={`/api/assets/${asset.id}/audio`}
          />
          <div className="hum-region">
            <label className="field">
              <span>Start · seconds</span>
              <input
                aria-label="Hum start"
                type="number"
                min={0}
                max={Math.max(0, asset.duration - 3)}
                step="0.1"
                value={hum.start}
                onChange={(e) => {
                  const start = Math.max(
                    0,
                    Math.min(asset.duration - 3, +e.target.value),
                  );
                  update({
                    start,
                    duration: Math.min(hum.duration, asset.duration - start),
                  });
                }}
              />
            </label>
            <label className="field">
              <span>Length · seconds</span>
              <input
                aria-label="Hum length"
                type="number"
                min={3}
                max={Math.min(30, asset.duration - hum.start)}
                step="0.1"
                value={hum.duration}
                onChange={(e) =>
                  update({
                    duration: Math.max(
                      3,
                      Math.min(30, asset.duration - hum.start, +e.target.value),
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Melody tempo · BPM</span>
              <input
                aria-label="Hum tempo"
                type="number"
                min={40}
                max={240}
                value={hum.tempo}
                onChange={(e) =>
                  update({
                    tempo: Math.max(
                      40,
                      Math.min(240, Math.round(+e.target.value)),
                    ),
                  })
                }
              />
            </label>
          </div>
          <details className="lyric-tools">
            <summary>Melody controls</summary>
            <label className="field">
              <span>Melody plan</span>
              <select
                aria-label="Hum melody plan"
                value={hum.mode}
                onChange={(e) =>
                  update({ mode: e.target.value as HumSource["mode"] })
                }
              >
                <option value="continue">Continue my opening melody</option>
                <option value="melody">Use just the detected melody</option>
              </select>
            </label>
            <label className="field">
              <span>Phrasing influence · {hum.influence.toFixed(1)}</span>
              <input
                aria-label="Hum phrasing influence"
                type="range"
                min={0}
                max={2}
                step="0.1"
                value={hum.influence}
                onChange={(e) => update({ influence: +e.target.value })}
              />
            </label>
          </details>
          <p className="generation-hint">
            Uses melody planning for this take. Tune the tempo to your hum.
            Length follows the composition, not the recording length. Original
            audio stays saved when detached.
          </p>
          {p.generation.useScore && (
            <div className="generation-limit" role="note">
              Your edited Studio score is protected. Detach the hum or turn off
              Use saved ABC for next take before generating.
            </div>
          )}
        </>
      )}
    </details>
  );
}
