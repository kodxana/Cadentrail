import {newAgentGuide, type AgentGuideState, type AgentClient} from "./agentGuide";
import { createPortal } from "react-dom";
import { IntegrationsButton } from "./IntegrationsButton";
import { AgentsButton } from "./AgentsButton";
import { ProjectNavigation } from "./ProjectNavigation";
import { RecoveryDialog } from "./RecoveryDialog";
import { SessionDialog } from "./SessionDialog";
import { recoveryWorkspace } from "./recovery";
import { onSessionExpired } from "./authErrors";
import { Personalization, PersonalizationButton } from "./Personalization";
import { readProfile } from "./profile";
import { HelpButton, useHelp } from "./Help";
import { tours } from "./helpTours";
import { AuthShell } from "./AuthShell";
import { Dialog } from "./Dialog";
import { version } from "../package.json";
import {
  ExperienceAtmosphere,
  ExperienceSwitch,
  ExperienceWordmark,
} from "./ExperienceChrome";
import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  Component,
  type ReactNode,
} from "react";
import { expandedNotes } from "./editing";
import { VramStatus } from "./VramStatus";
import { AccessNotice, AccessSettings } from "./AccessSettings";
import { MusicLibrary } from "./MusicLibrary";
import { NowPlaying } from "./NowPlaying";
import { loadMusicLibrary } from "./libraryData";
import { libraryPlayer } from "./libraryPlayer";
import { claimPlayback, mediaPlaybackOwner } from "./playbackFocus";
import { BRAND, TAGLINE, BrandMark, BrandCredits } from "./Brand";
import {
  Activity,
  Info,
  ArrowDownToLine,
  AudioLines,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Heart,
  Keyboard,
  LayoutGrid,
  Library,
  Menu,
  Mic,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Undo2,
  Redo2,
  Upload,
  X,
  Volume2,
  Check,
  AlertCircle,
  Disc3,
  MoreHorizontal,
  ChevronsLeft,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import { Timeline } from "./Timeline";
const PianoRoll=lazy(()=>import("./PianoRoll").then(m=>({default:m.PianoRoll})));
import { Mixer, Effects, Slider } from "./Mixer";
import { Create } from "./Create";
const Visuals=lazy(()=>import("./Visuals").then(m=>({default:m.Visuals})));
const Integrations=lazy(()=>import("./Integrations"));
const AgentsGuide=lazy(()=>import("./AgentsGuide"));
const WorkspaceTools=lazy(()=>import("./WorkspaceTools").then(m=>({default:m.WorkspaceTools})));
const TaskCenter = lazy(() =>
  import("./TaskCenter").then((m) => ({ default: m.TaskCenter })),
);
import { terminal } from "./Jobs";
const Analyze=lazy(()=>import("./Analyze").then(m=>({default:m.Analyze})));
import { engine } from "./audio";
import { exportCapabilities } from "./exportCapabilities";
import { browserRender } from "./export";
import { api, post, download, fileApi } from "./api";
import {
  useStudio,
  acceptAuthenticatedSession,
  protectUnsavedEdits,
  getState,
  setState,
  createProject,
  openProject,
  edit,
  editClip,
  selectedClip,
  selectedTrack,
  save,
  undo,
  redo,
  copy,
  paste,
  deleteSelected,
  split,
  importFile,
  placeAsset,
  refreshCandidates,
  report,
  notice,
  addTrack,
} from "./store";
import {
  bars,
  endBeat,
  newTrack,
  newClip,
  newNote,
  id,
  palette,
  isTyping,
  clamp,
  db,
  type Project,
  type Job,
  type Asset,
} from "./model";
const tabs = [
  ["arrange", "Arrange", AudioLines],
  ["score", "Piano Roll", Music2],
  ["notation", "Score", BookOpen],
  ["mix", "Mix", SlidersHorizontal],
  ["analyze", "Analyze", Activity],
] as const;
export class Boundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <AuthShell>
          <div className="fatal">
            <h1>The workstation encountered an error.</h1>
            <p>{this.state.error}</p>
            <button
              onClick={() => {
                if (getState().project)
                  download(
                    "recovery.json",
                    JSON.stringify(getState().project, null, 2),
                    "application/json",
                  );
              }}
            >
              Download recovery project
            </button>
            <button className="primary" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </AuthShell>
      );
    return this.props.children;
  }
}
function ClockDisplay() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame: number;
    const draw = () => {
      const s = getState(),
        p = s.project;
      if (ref.current && p) {
        const b = Math.max(0, s.playing ? engine.beat() : s.cursor),
          sec = (b * 60) / p.tempo,
          bar = bars(p);
        const unit = p.timeSignature[1] / 4;
        ref.current.innerHTML = `<strong>${String(Math.floor(b / bar) + 1).padStart(3, "0")}<span> . </span>${String(Math.floor((b % bar) * unit) + 1).padStart(2, "0")}<span> . </span>${String(Math.floor(((b * unit) % 1) * 100)).padStart(2, "0")}</strong><small>${String(Math.floor(sec / 60)).padStart(2, "0")}:${(sec % 60).toFixed(2).padStart(5, "0")}</small>`;
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className="transport-clock" ref={ref} />;
}
function Transport() {
  const s = useStudio(),
    p = s.project!,
    taps = useRef<number[]>([]);
  return (
    <div className="transport">
      <div className="transport-buttons">
        <button title="Return to start" onClick={() => void engine.seek(0)}>
          <ChevronsLeft size={17} />
        </button>
        <button title="Stop" onClick={() => engine.stop()}>
          <Square size={15} />
        </button>
        <button
          className={"play " + (s.playing ? "active" : "")}
          aria-label={s.playing ? "Pause" : "Play"}
          onClick={() => void engine.play().catch(report)}
        >
          {s.playing ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </button>
        <button
          title="Loop selected region"
          className={s.loop ? "active" : ""}
          onClick={() => {
            const beat = engine.beat();
            setState({ loop: !s.loop });
            if (s.playing) void engine.seek(beat).catch(report);
          }}
        >
          <Repeat2 size={18} />
        </button>
      </div>
      <ClockDisplay />
      <div className="tempo-box">
        <input
          aria-label="Project tempo"
          type="number"
          min="20"
          max="400"
          value={p.tempo}
          onChange={(e) =>
            edit("Change tempo", (p) => {
              p.tempo = clamp(+e.target.value, 20, 400);
            })
          }
        />
        <button
          title="Tap tempo"
          onClick={() => {
            const now = performance.now();
            taps.current = taps.current.filter((t) => now - t < 5000).slice(-7);
            taps.current.push(now);
            if (taps.current.length > 2) {
              const bpm =
                (60000 * (taps.current.length - 1)) / (now - taps.current[0]);
              edit("Tap tempo", (p) => {
                p.tempo = Math.round(clamp(bpm, 20, 400));
              });
            }
          }}
        >
          BPM / TAP
        </button>
      </div>
      <select
        className="time-signature"
        aria-label="Time signature"
        value={p.timeSignature.join("/")}
        onChange={(e) =>
          edit("Time signature", (p) => {
            p.timeSignature = e.target.value.split("/").map(Number) as [
              number,
              number,
            ];
          })
        }
      >
        {["4/4", "3/4", "6/8", "5/4", "7/8"].map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <button
        title="Metronome"
        className={s.metronome ? "active" : ""}
        onClick={() => setState({ metronome: !s.metronome })}
      >
        <Music2 size={15} />
      </button>
      <div className="spacer" />
      <div className="loop-range">
        <span>LOOP</span>
        <input
          aria-label="Loop start beat"
          type="number"
          min="0"
          max={p.loopEnd - 0.25}
          step="0.25"
          value={p.loopStart}
          onChange={(e) =>
            edit("Loop start", (p) => {
              p.loopStart = clamp(+e.target.value, 0, p.loopEnd - 0.25);
            })
          }
        />
        <span>—</span>
        <input
          aria-label="Loop end beat"
          type="number"
          min={p.loopStart + 0.25}
          step="0.25"
          value={p.loopEnd}
          onChange={(e) =>
            edit("Loop end", (p) => {
              p.loopEnd = Math.max(p.loopStart + 0.25, +e.target.value);
            })
          }
        />
      </div>
      <div className="engine-state">
        <span className="status-dot" /> WEB AUDIO
      </div>
    </div>
  );
}
function BrowserPanel({ onImport }: { onImport: () => void }) {
  const s = useStudio(),
    p = s.project!;
  return (
    <aside className="browser-panel">
      <div className="panel-title">
        PROJECT BROWSER
        <button onClick={onImport} title="Import files">
          <Plus size={14} />
        </button>
      </div>
      <div className="browser-project">
        <FolderOpen size={15} />
        <strong>{p.name}</strong>
      </div>
      <div className="browser-section">
        <span>TRACKS</span>
        <span>{p.tracks.length}</span>
      </div>
      {p.tracks.map((t) => (
        <button
          key={t.id}
          className={
            "browser-track " + (s.selectedTrack === t.id ? "selected" : "")
          }
          onClick={() =>
            setState({
              selectedTrack: t.id,
              selectedClips: t.clips.length ? [t.clips[0].id] : [],
            })
          }
        >
          <i style={{ background: t.color }} />
          {t.type === "midi" ? <Music2 size={13} /> : <AudioLines size={13} />}
          <span>{t.name}</span>
        </button>
      ))}
      <div className="browser-section">
        <span>AUDIO ASSETS</span>
        <span>{s.assets.length}</span>
      </div>
      {s.assets.map((a) => (
        <button
          className="asset-row"
          draggable
          key={a.id}
          title="Double-click to place in arrangement"
          onDoubleClick={() => placeAsset(a)}
          onDragStart={(e) =>
            e.dataTransfer.setData("application/x-studio-asset", a.id)
          }
        >
          <AudioLines size={13} />
          <span>{a.name}</span>
          <small>
            {Math.floor(a.duration / 60)}:
            {String(Math.floor(a.duration % 60)).padStart(2, "0")}
          </small>
        </button>
      ))}
      {!s.assets.length && (
        <button className="drop-hint" onClick={onImport}>
          <Upload size={18} />
          <span>
            Drop audio here
            <br />
            or browse files
          </span>
          <small>WAV · FLAC · MP3 · MIDI · ABC</small>
        </button>
      )}
      <div className="browser-section">
        <span>SONG SECTIONS</span>
        <span>{p.sections.length}</span>
      </div>
      {p.sections.map((section) => (
        <button
          className="section-row"
          key={section.id}
          onClick={() => void engine.seek(section.beat)}
        >
          <span>
            {String(Math.floor(section.beat / bars(p)) + 1).padStart(2, "0")}
          </span>
          {section.name}
          <ChevronRight size={12} />
        </button>
      ))}
      <div className="browser-bottom">
        <span className="status-dot" />
        <span>{s.saveState}</span>
        <small>rev {p.revision}</small>
      </div>
    </aside>
  );
}
function StepSequencer() {
  const s = useStudio(),
    t = selectedTrack(),
    c = selectedClip();
  if (!t || !c || t.type !== "midi")
    return (
      <p className="help">Select an instrument clip to build a drum pattern.</p>
    );
  return (
    <div className="step-sequencer">
      <div className="inspector-heading">STEP SEQUENCER</div>
      <label className="field">
        Pattern length{" "}
        <select
          aria-label="Step pattern length"
          value={c.loopBeats}
          onChange={(e) =>
            editClip("Change pattern length", (c) => {
              c.loopBeats = +e.target.value;
              c.duration = Math.max(c.duration, c.loopBeats);
            })
          }
        >
          {[4, 8, 16].map((b) => (
            <option key={b} value={b}>
              {b * 4} steps
            </option>
          ))}
        </select>
      </label>
      <p className="help">
        Sixteenth-note steps · Shift-click an active step to change velocity.
      </p>
      <button
        onClick={() =>
          edit("Use drum kit", (p) => {
            p.tracks.find((x) => x.id === t.id)!.instrument = "drums";
          })
        }
      >
        Use drum kit
      </button>
      {[
        [36, "Kick"],
        [38, "Snare"],
        [42, "Hat"],
        [46, "Open hat"],
      ].map(([pitch, label]) => (
        <div className="step-row" key={pitch}>
          <span>{label}</span>
          <div
            style={{
              overflowX: "auto",
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(64, Math.ceil(c.loopBeats * 4))},14px)`,
            }}
          >
            {Array.from(
              { length: Math.min(64, Math.ceil(c.loopBeats * 4)) },
              (_, i) => {
                const active = c.notes.find(
                  (n) =>
                    n.pitch === pitch && Math.abs(n.beat - i * 0.25) < 0.001,
                );
                return (
                  <button
                    key={i}
                    className={
                      (active ? "on " : "") + (i % 4 === 0 ? "beat" : "")
                    }
                    aria-label={`${label} step ${i + 1}`}
                    title={active ? "Velocity " + active.velocity : "Add note"}
                    style={
                      active
                        ? { opacity: 0.4 + (0.6 * active.velocity) / 127 }
                        : undefined
                    }
                    onClick={(e) =>
                      editClip("Toggle drum step", (c) => {
                        if (active && e.shiftKey)
                          c.notes.find((n) => n.id === active.id)!.velocity =
                            active.velocity >= 112
                              ? 48
                              : Math.min(127, active.velocity + 32);
                        else if (active)
                          c.notes = c.notes.filter((n) => n.id !== active.id);
                        else
                          c.notes.push(newNote(i * 0.25, Number(pitch), 0.1));
                      })
                    }
                  />
                );
              },
            )}{" "}
          </div>
        </div>
      ))}
      <button
        disabled={c.loopBeats >= 16}
        onClick={() =>
          editClip("Duplicate pattern", (c) => {
            c.notes.push(
              ...c.notes
                .filter((n) => n.beat < c.loopBeats)
                .map((n) => ({ ...n, id: id(), beat: n.beat + c.loopBeats })),
            );
            c.loopBeats *= 2;
            c.duration = Math.max(c.duration, c.loopBeats);
          })
        }
      >
        Double pattern
      </button>
    </div>
  );
}
function Inspector() {
  const s = useStudio(),
    p = s.project!,
    c = selectedClip(),
    t = selectedTrack(),
    [tab, setTab] = useState("clip");
  return (
    <aside className="inspector">
      <div className="panel-title">
        INSPECTOR
        <Settings2 size={14} />
      </div>
      <div className="inspector-tabs">
        {["clip", "effects", "steps"].map((label) => (
          <button
            className={tab === label ? "active" : ""}
            key={label}
            onClick={() => setTab(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="inspector-content">
        {tab === "effects" ? (
          <Effects />
        ) : tab === "steps" ? (
          <StepSequencer />
        ) : (
          <>
            <div className="inspector-heading">
              {t?.type === "midi" ? "INSTRUMENT TRACK" : "AUDIO TRACK"}
            </div>
            {t && (
              <>
                <label className="field">
                  <span>Track name</span>
                  <input
                    value={t.name}
                    onChange={(e) =>
                      edit("Rename track", (p) => {
                        p.tracks.find((x) => x.id === t.id)!.name =
                          e.target.value;
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Track color</span>
                  <input
                    type="color"
                    value={t.color}
                    onChange={(e) =>
                      edit("Track color", (p) => {
                        const track = p.tracks.find((x) => x.id === t.id)!;
                        track.color = e.target.value;
                        track.clips.forEach((c) => (c.color = e.target.value));
                      })
                    }
                  />
                </label>
                {t.type === "midi" && (
                  <label className="field">
                    <span>Instrument</span>
                    <select
                      value={t.instrument}
                      onChange={(e) =>
                        edit("Instrument", (p) => {
                          p.tracks.find((x) => x.id === t.id)!.instrument = e
                            .target.value as typeof t.instrument;
                        })
                      }
                    >
                      {["piano", "poly", "bass", "pad", "drums"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <small>Piano is a synthesized audition voice.</small>
                  </label>
                )}
                <label className="field">
                  <span>
                    Track volume <b>{db(t.volume)} dB</b>
                  </span>
                  <Slider
                    value={t.volume}
                    max={2}
                    label="Track volume"
                    update={(p, v) => {
                      p.tracks.find((x) => x.id === t.id)!.volume = v;
                    }}
                  />
                </label>
              </>
            )}
            {c && (
              <>
                <div className="inspector-divider" />
                <div className="inspector-heading">SELECTED CLIP</div>
                <label className="field">
                  <span>Name</span>
                  <input
                    aria-label="Clip name"
                    value={c.name}
                    onChange={(e) =>
                      editClip("Rename clip", (c) => {
                        c.name = e.target.value;
                      })
                    }
                  />
                </label>
                <div className="form-row">
                  <label className="field">
                    <span>Start beat</span>
                    <input
                      aria-label="Clip start beat"
                      type="number"
                      min="0"
                      step="0.25"
                      value={c.beat}
                      onChange={(e) =>
                        editClip("Move clip", (c) => {
                          c.beat = Math.max(0, +e.target.value);
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Length</span>
                    <input
                      aria-label="Clip duration"
                      type="number"
                      min="0.125"
                      step="0.25"
                      value={c.duration}
                      onChange={(e) =>
                        editClip("Resize clip", (c) => {
                          c.duration = Math.max(0.125, +e.target.value);
                        })
                      }
                    />
                  </label>
                </div>
                {c.assetId && (
                  <label className="field">
                    <span>Source offset · seconds</span>
                    <input
                      aria-label="Source offset"
                      type="number"
                      min="0"
                      step="0.01"
                      value={c.offset}
                      onChange={(e) =>
                        editClip("Slip source", (c) => {
                          c.offset = Math.max(0, +e.target.value);
                        })
                      }
                    />
                  </label>
                )}
                <label className="field">
                  <span>
                    Clip gain <b>{db(c.gain)} dB</b>
                  </span>
                  <Slider
                    value={c.gain}
                    max={4}
                    label="Clip gain"
                    update={(p, v) => {
                      p.tracks
                        .flatMap((t) => t.clips)
                        .find((x) => x.id === c.id)!.gain = v;
                    }}
                  />
                </label>
                <div className="form-row">
                  <label className="field">
                    <span>Fade in · beats</span>
                    <input
                      type="number"
                      min="0"
                      max={c.duration}
                      step="0.25"
                      value={c.fadeIn}
                      onChange={(e) =>
                        editClip("Fade in", (c) => {
                          c.fadeIn = clamp(+e.target.value, 0, c.duration);
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Fade out · beats</span>
                    <input
                      type="number"
                      min="0"
                      max={c.duration}
                      step="0.25"
                      value={c.fadeOut}
                      onChange={(e) =>
                        editClip("Fade out", (c) => {
                          c.fadeOut = clamp(+e.target.value, 0, c.duration);
                        })
                      }
                    />
                  </label>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={c.muted}
                    onChange={(e) =>
                      editClip("Mute clip", (c) => {
                        c.muted = e.target.checked;
                      })
                    }
                  />{" "}
                  Mute clip
                </label>
                {c.assetId ? (
                  <>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={c.reverse}
                        onChange={(e) =>
                          editClip("Reverse playback", (c) => {
                            c.reverse = e.target.checked;
                          })
                        }
                      />{" "}
                      Reverse playback
                    </label>
                    <button
                      className="wide"
                      disabled={!s.status.stemsAvailable}
                      onClick={() =>
                        void post("/jobs", {
                          projectId: p.id,
                          kind: "separate",
                          assetId: c.assetId,
                        })
                          .then(() => notice("Demucs separation queued"))
                          .catch(report)
                      }
                    >
                      Separate stems · Demucs
                    </button>
                    <button
                      className="wide"
                      onClick={async () => {
                        try {
                          setState({ busy: "Normalizing audio…" });
                          const a = await post<Asset>(
                            "/assets/" + c.assetId + "/process",
                            { operation: "normalize" },
                          );
                          setState({ assets: [...s.assets, a] });
                          editClip("Use normalized audio", (c) => {
                            c.assetId = a.id;
                          });
                        } catch (e) {
                          report(e);
                        } finally {
                          setState({ busy: null });
                        }
                      }}
                    >
                      Normalize a copy
                    </button>
                  </>
                ) : (
                  <>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={c.loop}
                        onChange={(e) =>
                          editClip("Loop pattern", (c) => {
                            c.loop = e.target.checked;
                          })
                        }
                      />{" "}
                      Repeat pattern
                    </label>
                    {c.loop && (
                      <label className="field">
                        <span>Pattern length · beats</span>
                        <input
                          type="number"
                          min="0.25"
                          step="0.25"
                          value={c.loopBeats}
                          onChange={(e) =>
                            editClip("Pattern length", (c) => {
                              c.loopBeats = Math.max(0.25, +e.target.value);
                            })
                          }
                        />
                      </label>
                    )}
                  </>
                )}
              </>
            )}
            <div className="inspector-divider" />
            <label className="field">
              <span>Project key</span>
              <select
                value={p.key}
                onChange={(e) =>
                  edit("Project key", (p) => {
                    p.key = e.target.value;
                  })
                }
              >
                {[
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
                ].flatMap((k) =>
                  ["major", "minor"].map((scale) => (
                    <option key={k + scale}>{k + " " + scale}</option>
                  )),
                )}
              </select>
            </label>
            <p className="help">
              Edits are non-destructive. Original recordings and generated takes
              remain in the project.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
function ExportDialog({ close }: { close: () => void }) {
  const s = useStudio(),
    p = s.project!;
  const [options, setOptions] = useState({
    format: "wav",
    sampleRate: 48000,
    bitDepth: 24,
    master: false,
    lufs: -14,
    region: false,
    tailSeconds: 3,
  });
  const [renderer,setRenderer]=useState<"browser"|"server">("browser");
  const compatibility=exportCapabilities(p,options.region,options.tailSeconds);
  return (
    <Dialog titleId="export-title" onClose={close}>
      <div className="modal-title">
        <h2 id="export-title">Export your session</h2>
        <button aria-label="Close export your session" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <p className="help">
        Browser render includes instruments, routing and every insert. Optional
        mastering runs on the backend and preserves the raw mix.
      </p>
      <div className="form-row">
        <label className="field">
          <span>Format</span>
          <select
            value={options.format}
            onChange={(e) => setOptions({ ...options, format: e.target.value, bitDepth: e.target.value!=="wav"&&options.bitDepth===32?24:options.bitDepth })}
          >
            {["wav", "flac", "mp3"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Sample rate</span>
          <select
            value={options.sampleRate}
            onChange={(e) =>
              setOptions({ ...options, sampleRate: +e.target.value })
            }
          >
            {[44100, 48000, 96000].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Bit depth</span>
          <select
            value={options.bitDepth}
            onChange={(e) =>
              setOptions({ ...options, bitDepth: +e.target.value })
            }
          >
            <option value="16">16 bit + dither</option>
            <option value="24">24 bit</option>
            <option value="32" disabled={options.format!=="wav"}>32 bit float (WAV)</option>
          </select>
        </label>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={options.region}
          onChange={(e) => setOptions({ ...options, region: e.target.checked })}
        />{" "}
        Selected loop region only
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={options.master}
          onChange={(e) => setOptions({ ...options, master: e.target.checked })}
        />{" "}
        Master copy · loudness normalization, −1 dBTP ceiling
      </label>
      {options.master && (
        <label className="field">
          <span>Integrated loudness target · LUFS</span>
          <input
            type="number"
            min="-24"
            max="-9"
            value={options.lufs}
            onChange={(e) =>
              setOptions({
                ...options,
                lufs: clamp(+e.target.value, -24, -9),
              })
            }
          />
        </label>
      )}
      <div className="form-row"><label className="field"><span>Render with</span><select value={renderer} onChange={e=>setRenderer(e.target.value as typeof renderer)}><option value="browser">Browser · full instruments and effects</option><option value="server">Server · supported audio tracks</option></select></label><label className="field"><span>Effect tail · seconds</span><input type="number" min={0} max={30} step={1} value={options.tailSeconds} onChange={e=>setOptions({...options,tailSeconds:Number(e.target.value)})}/></label></div>
      <p className="help">{compatibility.totalDuration.toFixed(1)} seconds including tail · approximately {Math.ceil(compatibility.memory/1024/1024)} MiB browser audio buffers. Other browser memory is additional.</p>
      {renderer==="server"&&<p className="help">Server dynamics use FFmpeg and can sound different from browser preview.</p>}
      {compatibility[renderer].length>0&&<ul role="status">{compatibility[renderer].map(reason=><li key={reason}>{reason}</li>)}</ul>}
      <button className="primary wide" disabled={compatibility[renderer].length>0} onClick={async()=>{
        if(renderer==="browser"){close();void browserRender(options).catch(report);return;}
        try{await save();if(getState().dirty)throw new Error("Save your changes before exporting.");const job=await post<Job>("/jobs",{projectId:p.id,kind:"export",options});setState({jobs:[job,...getState().jobs]});notice("Server export queued. Download it from Queue when it finishes.");close();}catch(e){report(e);}
      }}><ArrowDownToLine size={16}/>{renderer==="browser"?"Render and download":"Queue server export"}</button>
      <div className="inspector-divider" />
      <div className="export-data">
        <button
          onClick={() =>
            download(
              p.name + ".json",
              JSON.stringify(p, null, 2),
              "application/json",
            )
          }
        >
          Project JSON
        </button>
        <button onClick={() => download(p.name + ".abc", p.generation.abc)}>
          ABC score
        </button>
        <button
          onClick={async () => {
            try {
              const response = await fetch("/api/midi/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  notes: p.tracks.flatMap((t) =>
                    t.clips.flatMap((c) =>
                      expandedNotes(c).map((n) => ({
                        ...n,
                        beat: n.beat + c.beat,
                      })),
                    ),
                  ),
                  tempo: p.tempo,
                  timeSignature: p.timeSignature,
                }),
              });
              if (!response.ok) throw new Error(await response.text());
              download(
                p.name + ".mid",
                await response.arrayBuffer(),
                "audio/midi",
              );
            } catch (e) {
              report(e);
            }
          }}
        >
          MIDI
        </button>
        <a className="button" href={"/api/projects/" + p.id + "/portable"}>
          Portable ZIP
        </a>
        <button
          onClick={() =>
            download(
              p.name + "-generation.json",
              JSON.stringify(
                { generation: p.generation, candidates: p.candidates },
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          Generation metadata
        </button>
      </div>
      <p className="help">
        Your original audio is retained. Choose browser rendering for the complete
        workstation mix; the server option checks its supported processing first.
      </p>
    </Dialog>
  );
}
function HistoryDialog({ close }: { close: () => void }) {
  const s = useStudio(),
    [revisions, setRevisions] = useState<
      { revision: number; label: string; created: number }[]
    >([]);
  useEffect(() => {
    void api<typeof revisions>("/projects/" + s.project!.id + "/revisions")
      .then(setRevisions)
      .catch(report);
  }, []);
  return (
    <Dialog titleId="history-title" onClose={close}>
      <div className="modal-title">
        <h2 id="history-title">Project history</h2>
        <button aria-label="Close project history" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <p className="help">
        Restoring creates a new revision; previous versions remain available.
      </p>
      <div className="history-list">
        {revisions.map((r) => (
          <button
            key={r.revision}
            onClick={async () => {
              try {
                await save();
                await post(
                  "/projects/" + s.project!.id + "/restore/" + r.revision,
                );
                await openProject(s.project!.id);
                close();
              } catch (e) {
                report(e);
              }
            }}
          >
            <span>
              r{r.revision} · {r.label}
            </span>
            <small>{new Date(r.created * 1000).toLocaleString()}</small>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
export default function App() {
  const s = useStudio();
  const { tour, startTour, openChangelog } = useHelp();
  const tourOriginalView = useRef<typeof s.view | null>(null);
  useEffect(() => {
    const target = tour?.id === "studio" ? tours.studio.steps[tour.step].studioView : undefined;
    if (target && getState().project) {
      tourOriginalView.current ??= getState().view;
      if (getState().view !== target) setState({ view: target });
    } else if (tourOriginalView.current) {
      const view = tourOriginalView.current;
      tourOriginalView.current = null;
      if (getState().view !== view) setState({ view });
    }
  }, [tour?.id, tour?.step]);
  const studioMode = [
    "arrange",
    "score",
    "notation",
    "mix",
    "analyze",
  ].includes(s.view);
  const [lastStudio, setLastStudio] = useState<
    "arrange" | "score" | "notation" | "mix" | "analyze"
  >("arrange");
  const [firstRun, setFirstRun] = useState(() => !readProfile().welcomed);
  useEffect(() => {
    if (studioMode) setLastStudio(s.view as typeof lastStudio);
  }, [s.view]);
  const navigate = async (view: typeof s.view) => {
    if (view === "home" || view === "create" || view === "visuals")
      engine.stop();
    if (view !== "home" && !getState().project)
      await createProject("Untitled song");
    setState({ view });
    if (
      view === "create" ||
      ["arrange", "score", "notation", "mix", "analyze"].includes(view)
    )
      localStorage.setItem(
        "studio:experience",
        view === "create" ? "create" : "studio",
      );
  };
  const [agentGuide,setAgentGuide]=useState<AgentGuideState>(()=>newAgentGuide(location.search));
  const [integrationSetup,setIntegrationSetup]=useState(()=>({tab:new URLSearchParams(location.search).get("integrations")==="runpod"?"runpod":"connect",client:"Codex"}));
  const [auth, setAuth] = useState<boolean | null>(null),
    [password, setPassword] = useState(""),
    [loginError, setLoginError] = useState<string | null>(null),
    [signingIn, setSigningIn] = useState(false),
    [passwordRequired, setPasswordRequired] = useState<boolean | null>(null),
    [dialog, setDialog] = useState<
      | "export"
      | "history"
      | "shortcuts"
      | "queue"
      | "files"
      | "about"
      | "access"
      | "maintenance"
      | "integrations"
      | "agents"
      | null
    >(new URLSearchParams(location.search).has("agents") ? "agents" : new URLSearchParams(location.search).has("integrations") ? "integrations" : null),
    [left, setLeft] = useState(() =>
      window.innerWidth <= 1100
        ? 0
        : +(localStorage.getItem("studio:v2:left") ?? 0),
    ),
    [right, setRight] = useState(() =>
      window.innerWidth <= 1100
        ? 0
        : +(localStorage.getItem("studio:v2:right") ?? 250),
    ),
    [recording, setRecording] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    jobStates = useRef<Record<string, string>>({});
  useEffect(() => {
    void api<{ authenticated: boolean; passwordRequired: boolean; workstationId: string }>("/session")
      .then((r) => {
        recoveryWorkspace(r.workstationId);
        if (r.authenticated) acceptAuthenticatedSession();
        setAuth(r.authenticated);
        setPasswordRequired(r.passwordRequired);
        if (r.authenticated && /^#[a-f0-9]{32}$/.test(location.hash))
          void openProject(location.hash.slice(1));
      })
      .catch(report);
  }, []);
  useEffect(() => onSessionExpired(() => {
    protectUnsavedEdits();engine.stop();libraryPlayer.pause();claimPlayback("session");setAuth(false);
  }), []);
  useEffect(() => {
    const reconnected=()=>{ if(auth && getState().dirty) void save(); };
    window.addEventListener("online",reconnected);
    return ()=>window.removeEventListener("online",reconnected);
  },[auth]);
  useEffect(() => {
    if (!auth) return;
    const openHash = () => {
      const projectId = location.hash.slice(1);
      if (
        /^[a-f0-9]{32}$/.test(projectId) &&
        getState().project?.id !== projectId
      )
        void openProject(projectId);
    };
    window.addEventListener("hashchange", openHash);
    return () => window.removeEventListener("hashchange", openHash);
  }, [auth]);
  useEffect(() => {
    if (!auth) return;
    let disposed = false,
      socket: WebSocket | undefined,
      retry: number;
    void api<Record<string, unknown>>("/status")
      .then((status) => setState({ status }))
      .catch(report);
    const connect = () => {
      socket = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/api/events",
      );
      socket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (!data.jobs) return;
        setState({
          jobs: data.jobs,
          status: { ...getState().status, ...data.worker },
        });
        for (const j of data.jobs as Job[]) {
          if (
            jobStates.current[j.id] &&
            jobStates.current[j.id] !== j.state &&
            ["Complete", "Failed", "Cancelled"].includes(j.state)
          ) {
            if (
              j.state === "Complete" &&
              j.projectId === getState().project?.id
            )
              void refreshCandidates().catch(report);
            if (j.state === "Complete") void loadMusicLibrary().catch(report);
            if (j.state === "Failed") report(j.message);
          }
          jobStates.current[j.id] = j.state;
        }
      };
      socket.onclose = (event) => {
        if (disposed) return;
        if(event.code===1008) {
          void api<{authenticated:boolean}>("/session").then(s=>{
            if(disposed)return;
            if(!s.authenticated){protectUnsavedEdits();setAuth(false);}
            else retry=window.setTimeout(connect,3000);
          }).catch(()=>{if(!disposed)retry=window.setTimeout(connect,3000);});
        } else retry = window.setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [auth]);
  const librarySignature = JSON.stringify(s.project && [s.project.id,s.project.name,s.project.artist,s.project.tags,s.project.favorite,s.project.archived,s.project.visuals.coverId,s.project.generation.style,s.project.tracks.length,s.project.candidates.map(c=>[c.id,c.assetId,c.name,c.favorite])]);
  const lastLibrarySignature=useRef("");
  useEffect(() => {
    if(!auth){lastLibrarySignature.current="";return;}
    if(!s.dirty && librarySignature!==lastLibrarySignature.current){
      lastLibrarySignature.current=librarySignature;
      void loadMusicLibrary().catch(error=>{lastLibrarySignature.current="";report(error);});
    }
  }, [auth, librarySignature, s.dirty]);
  useEffect(() => {
    const exclusive = (event: Event) => {
      const element = event.target;
      if (element instanceof HTMLMediaElement && !element.paused)
        claimPlayback(
          mediaPlaybackOwner(element),
          element,
        );
    };
    document.addEventListener("play", exclusive, true);
    return () => document.removeEventListener("play", exclusive, true);
  }, []);
  useEffect(() => {
    if (s.project) engine.sync(s.project);
  }, [s.project]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest("dialog") ||
          (e.code === "Space" &&
            e.target.closest('button,a,summary,[role="slider"]')))
      )
        return;
      const state = getState();
      if (state.listening || state.radio) return;
      if (
        e.code === "Space" &&
        ["home", "create", "visuals"].includes(state.view) &&
        libraryPlayer.current()
      ) {
        e.preventDefault();
        libraryPlayer.toggle();
        return;
      }
      if (!state.project || state.view === "home") return;
      const command = e.ctrlKey || e.metaKey,
        mode = state.view === "score" ? "notes" : "clips";
      if (["create", "visuals"].includes(state.view)) {
        if (command && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void save();
        }
        if (command && e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        void engine.play().catch(report);
      } else if (command && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (command && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (command && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copy(mode);
      } else if (command && e.key.toLowerCase() === "v") {
        e.preventDefault();
        paste(mode);
      } else if (command && e.key.toLowerCase() === "d") {
        e.preventDefault();
        paste(mode, true);
      } else if (command && e.key.toLowerCase() === "a") {
        e.preventDefault();
        if (mode === "notes")
          setState({
            selectedNotes: selectedClip()?.notes.map((n) => n.id) ?? [],
          });
        else
          setState({
            selectedClips: state.project.tracks
              .flatMap((t) => t.clips)
              .map((c) => c.id),
          });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected(mode);
      } else if (e.key.toLowerCase() === "s" && mode === "clips") split();
      else if (e.key.toLowerCase() === "m")
        editClip("Mute clip", (c) => {
          c.muted = !c.muted;
        });
      else if (e.key === "?" || e.key === "F1") {
        e.preventDefault();
        setDialog("shortcuts");
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      protectUnsavedEdits();
      if (getState().dirty || recorder.current?.state === "recording") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);
  useEffect(()=>{const show=()=>setDialog("integrations");window.addEventListener("cadentrail:integrations",show);return()=>window.removeEventListener("cadentrail:integrations",show)},[]);
  useEffect(()=>{const show=()=>setDialog("agents");window.addEventListener("cadentrail:agents",show);return()=>window.removeEventListener("cadentrail:agents",show)},[]);
  const openAgentSetup=(tab:"connect"|"tokens"|"reference",client:AgentClient)=>{
    setIntegrationSetup({tab,client:client==="Other agent"?"Other MCP":client});
    setDialog("integrations");
  };
  const closeAgents=()=>{
    setDialog(null);
    requestAnimationFrame(()=>Array.from(document.querySelectorAll<HTMLButtonElement>(".agents-entry")).find(b=>b.getClientRects().length>0)?.focus());
  };

  const record = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const activeStream = stream,
        projectId = getState().project!.id,
        targetTrackId = getState().selectedTrack,
        startBeat = engine.beat();
      const chunks: BlobPart[] = [];
      const r = new MediaRecorder(stream);
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        activeStream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const type = r.mimeType,
          extension = type.includes("ogg")
            ? "ogg"
            : type.includes("mp4")
              ? "m4a"
              : "webm";
        const file = new File(chunks, "Recording." + extension, { type });
        void (async () => {
          const asset = await fileApi<Asset>(
            "/projects/" + projectId + "/import",
            file,
          );
          if (getState().project?.id !== projectId) {
            notice("Recording saved in the original project audio library.");
            return;
          }
          setState({ assets: [...getState().assets, asset] });
          const clip = newClip({
            name: "Recording",
            assetId: asset.id,
            beat: Math.max(0, startBeat),
            duration: (asset.duration * getState().project!.tempo) / 60,
          });
          edit("Place microphone recording", (p) => {
            let track = p.tracks.find(
              (t) => t.id === targetTrackId && t.type === "audio",
            );
            if (!track) {
              track = newTrack({ name: "Microphone", type: "audio" });
              p.tracks.push(track);
            }
            track.clips.push(clip);
          });
          notice(
            "Recording placed at its start cursor. Device latency is not compensated.",
          );
        })().catch(report);
      };
      r.start(1000);
      setRecording(true);
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      report(
        "Microphone recording could not start: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  };
  const resize = (side: "left" | "right", e: React.PointerEvent) => {
    const start = e.clientX,
      value = side === "left" ? left : right;
    const move = (event: PointerEvent) => {
      const width = clamp(
        value + (event.clientX - start) * (side === "left" ? 1 : -1),
        170,
        420,
      );
      side === "left" ? setLeft(width) : setRight(width);
    };
    const up = (event: PointerEvent) => {
      const width = clamp(
        value + (event.clientX - start) * (side === "left" ? 1 : -1),
        170,
        420,
      );
      localStorage.setItem("studio:v2:" + side, String(width));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  if (auth === null)
    return (
      <AuthShell busy={!s.error}>
        <div className="login loading-state">
          {!s.error && <span className="spinner" aria-hidden="true" />}
          <p role={s.error ? "alert" : "status"}>
            {s.error || "Opening your workstation…"}
          </p>
          {s.recoveryError && <aside className="recovery-warning" role="alert"><span>{s.recoveryError}</span><button onClick={()=>download("Cadentrail-recovery.json",JSON.stringify(s.project,null,2),"application/json")}>Download recovery</button></aside>}
      {s.error && s.errorStatus!==401 && (
            <button onClick={() => window.location.reload()}>Try again</button>
          )}
        </div>
      </AuthShell>
    );
  if (auth === false && !s.project)
    return (
      <AuthShell>
        <div className="login">
          <h1>Welcome to your studio.</h1>
          <p>Enter the workstation password to open your projects.</p>
          <form
            aria-label="Sign in to workstation"
            onSubmit={(e) => {
              e.preventDefault();
              if (signingIn) return;
              setSigningIn(true);
              setLoginError(null);
              void post("/auth", { password })
                .then(() => {
                  acceptAuthenticatedSession();
                  setLoginError(null);
                  setAuth(true);
                  setPassword("");
                  if (!getState().project && /^#[a-f0-9]{32}$/.test(location.hash))
                    void openProject(location.hash.slice(1));
                })
                .catch((error) =>
                  setLoginError(
                    error instanceof Error ? error.message : String(error),
                  ),
                )
                .finally(() => setSigningIn(false));
            }}
          >
            <input
              aria-label="Workstation password"
              aria-invalid={!!loginError}
              aria-describedby={loginError ? "login-error" : undefined}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Workstation password"
            />
            <button className="primary" disabled={signingIn}>
              {signingIn ? "Signing in…" : "Open studio"}
            </button>
          </form>
          {loginError && (
            <p id="login-error" role="alert">
              {loginError}
            </p>
          )}
        </div>
      </AuthShell>
    );
  return (
    <div
      className={"app experience-" + (studioMode ? "studio" : s.view)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (s.listening || s.radio) return;
        if (!s.project) {
          notice("Open or create a session before importing files.");
          return;
        }
        const asset = e.dataTransfer.getData("application/x-studio-asset");
        if (asset) {
          const a = s.assets.find((a) => a.id === asset);
          if (a) placeAsset(a);
        } else
          for (const f of Array.from(e.dataTransfer.files)) void importFile(f);
      }}
    >
      <input
        ref={file}
        type="file"
        multiple
        accept="audio/*,.mid,.midi,.abc,.zip"
        className="hidden"
        onChange={(e) => {
          for (const f of Array.from(e.target.files ?? [])) void importFile(f);
          e.target.value = "";
        }}
      />
      <ExperienceAtmosphere
        creation
        coverUrl={
          s.project?.visuals.coverId
            ? `/api/projects/${s.project.id}/visuals/${s.project.visuals.coverId}`
            : null
        }
      />
      <header className="creation-header listening-room-header">
        <button
          className="creation-wordmark"
          aria-label={BRAND + " — Library"}
          title={BRAND + " · " + TAGLINE}
          onClick={() => {
            engine.stop();
            history.replaceState(null, "", location.pathname);
            setState({ view: "home" });
          }}
        >
          <ExperienceWordmark room="A DAW FOR YUE2" />
        </button>
        <ExperienceSwitch
          listening={s.listening}
          recording={recording}
          onListen={() => {
            engine.pause();
            setState({ listening: true });
          }}
        />
        <div className="creation-utilities"><AgentsButton/><IntegrationsButton/>
          <span data-help="creation-help"><HelpButton /></span>
          <PersonalizationButton />
          <button
            className="access-button"
            title="Access settings"
            onClick={(event) => {
              event.currentTarget.focus();
              setDialog("access");
            }}
          >
            <ShieldCheck size={16} />
          </button>
          <button title="Backups and models" aria-label="Workstation tools" onClick={()=>setDialog("maintenance")}><Settings2 size={16}/></button>
          <button title={"About " + BRAND} onClick={() => setDialog("about")}>
            <Info size={16} />
          </button>
          <button
            title="Keyboard shortcuts"
            onClick={() => setDialog("shortcuts")}
          >
            <Keyboard size={16} />
          </button>
        </div>
      </header>
      {s.project && s.view !== "home" && (
        <div
          className="app-header project-toolbar"
          role="toolbar"
          aria-label="Project actions"
          data-help="project-actions"
        >
          <ProjectNavigation />
          <input
            className="session-name"
            aria-label="Project name"
            value={s.project.name}
            onChange={(e) =>
              edit("Rename project", (p) => {
                p.name = e.target.value;
              })
            }
          />
          <button
            className="save-status"
            onClick={() => void save()}
            title="Save project (Ctrl+S)"
          >
            {s.dirty ? <Save size={12} /> : <Check size={12} />} {s.saveState}
          </button>
          <div className="spacer" />
          <button
            onClick={() => setDialog("queue")}
            title="Generation and render queue"
          >
            <Activity size={15} />
            Queue{" "}
            <span className="queue-count">
              {
                s.jobs.filter(
                  (j) =>
                    j.projectId === s.project?.id &&
                    !terminal(j) &&
                    !s.jobs.some((parent) =>
                      Object.values(parent.children ?? {}).includes(j.id),
                    ),
                ).length
              }
            </span>
          </button>
          <button onClick={() => setDialog("files")} title="Find project files">
            <FolderOpen size={15} />
            Files
          </button>
          <button
            title="Undo (Ctrl+Z)"
            disabled={!s.undo.length}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            title="Redo (Ctrl+Shift+Z)"
            disabled={!s.redo.length}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
          <button title="Version history" onClick={() => setDialog("history")}>
            <BookOpen size={16} />
          </button>
          {studioMode && (
            <button
              className={recording ? "record active" : "record"}
              title={recording ? "Stop recording" : "Record microphone"}
              onClick={() => void record()}
            >
              <Mic size={16} />
              {recording ? "Recording" : ""}
            </button>
          )}
          <button onClick={() => file.current?.click()}>
            <Upload size={14} /> Import
          </button>
          <button className="export-button" onClick={() => setDialog("export")}>
            <ArrowDownToLine size={14} /> Export
          </button>
        </div>
      )}
      {auth && passwordRequired === false && (
        <AccessNotice onSetup={() => setDialog("access")} />
      )}
      <nav className="primary-navigation" aria-label="Workspaces" data-help="workspaces">
        <div className="experience-switch">
          <button
            aria-current={s.view === "create" ? "page" : undefined}
            className={s.view === "create" ? "active" : ""}
            onClick={() => void navigate("create")}
          >
            <Music2 size={16} />
            Create
          </button>
          <button
            aria-current={studioMode ? "page" : undefined}
            className={"studio-entry " + (studioMode ? "active" : "")}
            onClick={() => void navigate(lastStudio)}
          >
            <SlidersHorizontal size={16} />
            Studio
          </button>
        </div>
        <button
          aria-current={s.view === "visuals" ? "page" : undefined}
          className={s.view === "visuals" ? "active" : ""}
          onClick={() => void navigate("visuals")}
        >
          <ImageIcon size={16} />
          Visuals
        </button>
        <button
          aria-current={s.view === "home" ? "page" : undefined}
          className={s.view === "home" ? "active" : ""}
          onClick={() => void navigate("home")}
        >
          <Library size={16} />
          Library
        </button>
        <details
          className="mobile-workspace-menu"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              event.currentTarget.open = false;
          }}
        >
          <summary
            aria-label="More workspaces"
            className={studioMode ? "active" : ""}
          >
            <MoreHorizontal size={16} /> {studioMode ? "Studio" : "More"}
          </summary>
          <div>
            <button
              aria-current={studioMode ? "page" : undefined}
              onClick={(event) => {
                const menu = event.currentTarget.closest("details");
                if (menu) menu.open = false;
                void navigate(lastStudio);
              }}
            >
              <SlidersHorizontal size={16} /> Open Studio
            </button>
          </div>
        </details>
        <div className="spacer" />
        {s.project && s.view === "home" && (
          <span className="project-context">{s.project.name}</span>
        )}
      </nav>
      {s.view === "home" || !s.project ? (
        <MusicLibrary />
      ) : (
        <>
          {studioMode && <Transport />}
          {studioMode && (
            <nav className="workspace-tabs">
              <button
                title="Project browser"
                aria-expanded={left > 0}
                onClick={() => setLeft(left ? 0 : 210)}
              >
                <Menu size={16} />
              </button>
              {tabs.map(([view, label, Icon]) => (
                <button
                  className={s.view === view ? "active" : ""}
                  onClick={() => setState({ view })}
                  key={view}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
              <div className="spacer" />
              <span className="dim">
                {s.project.key} · {s.project.tracks.length} tracks
              </span>
              <button
                title="Inspector"
                aria-expanded={right > 0}
                onClick={() => setRight(right ? 0 : 280)}
              >
                <Settings2 size={16} />
              </button>
            </nav>
          )}
          {s.view === "create" ? (
            <Create key={s.project!.id} />
          ) : s.view === "visuals" ? (
            <Suspense fallback={<div role="status">Opening Visuals…</div>}><Visuals /></Suspense>
          ) : (
            <div
              className={"studio-layout"}
              style={{
                gridTemplateColumns: `${left}px ${left ? 4 : 0}px minmax(0, 1fr) ${right ? 4 : 0}px ${right}px`,
              }}
            >
              {left > 0 && (
                <BrowserPanel onImport={() => file.current?.click()} />
              )}
              <div
                className="panel-resizer"
                style={{ gridColumn: 2 }}
                onPointerDown={(e) => resize("left", e)}
              />
              <main className="studio-main" style={{ gridColumn: 3 }}>
                {s.view === "arrange" ? (
                  <Timeline />
                ) : s.view === "score" || s.view === "notation" ? (
                  <Suspense fallback={<div role="status">Opening score editor…</div>}><PianoRoll
                    key={s.view}
                    initialMode={s.view === "notation" ? "abc" : "piano"}
                  /></Suspense>
                ) : s.view === "mix" ? (
                  <Mixer />
                ) : (
                  <Suspense fallback={<div role="status">Opening analysis…</div>}><Analyze /></Suspense>
                )}
              </main>
              <div
                className="panel-resizer"
                style={{ gridColumn: 4 }}
                onPointerDown={(e) => resize("right", e)}
              />
              {right > 0 && <Inspector />}
            </div>
          )}
          <footer className="status-bar">
            <span
              className={s.status.available ? "status-dot" : "status-dot amber"}
            />
            <span>
              {s.status.available
                ? String(s.status.model ?? "YuE2 ready")
                : "Editing ready · GPU generation unavailable locally"}
            </span>
            <span>
              {
                s.jobs.filter(
                  (j) => !["Complete", "Failed", "Cancelled"].includes(j.state),
                ).length
              }{" "}
              active jobs
            </span>
            <div className="spacer" />
            <span>
              {s.busy ??
                (s.dirty
                  ? s.saveState
                  : "Project saved on workstation storage")}
            </span>
            <VramStatus />
          </footer>
        </>
      )}
      {auth && <NowPlaying canListen={!recording} />}
      {firstRun && auth && (
        <Personalization
          onChoose={(mode, guided) => {
            setFirstRun(false);
            void (async () => {
              if (mode === "radio") setState({ listening: false, radio: true });
              else if (mode === "listen") setState({ listening: true });
              else {
                setState({ listening: false, radio: false });
                await navigate(mode === "studio" ? "arrange" : "create");
              }
              if (guided) startTour(mode);
            })().catch(report);
          }}
        />
      )}
      {s.error && (
        <div className="toast error" role="alert">
          <AlertCircle size={18} />
          <span>{s.error}</span>
          <button
            aria-label="Dismiss error"
            onClick={() => setState({ error: null, errorStatus: null })}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {s.notice && (
        <div className="toast notice" role="status">
          <Check size={16} />
          <span>{s.notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setState({ notice: null })}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {s.busy && (
        <div className="busy-indicator">
          <span className="spinner" />
          {s.busy}
        </div>
      )}
      {dialog === "export" && s.project && (
        <ExportDialog close={() => setDialog(null)} />
      )}{" "}
      {dialog === "history" && s.project && (
        <HistoryDialog close={() => setDialog(null)} />
      )}{" "}
      {dialog === "access" && (
        <AccessSettings
          protectedAccess={passwordRequired === true}
          onSignOut={async()=>{protectUnsavedEdits();await post("/logout");engine.stop();libraryPlayer.pause();claimPlayback("session");setDialog(null);setAuth(false);}}
          close={() => setDialog(null)}
        />
      )}
      {dialog === "about" && (
        <Dialog
          className="brand-about"
          titleId="about-title"
          onClose={() => setDialog(null)}
        >
          <div className="modal-title">
            <h2 id="about-title">
              <BrandMark size={30} /> {BRAND}
            </h2>
            <button aria-label="Close about" onClick={() => setDialog(null)}>
              <X size={18} />
            </button>
          </div>
          <p className="brand-tagline">{TAGLINE}</p>
          <p>
            Create songs, shape their scores, arrange, mix and make visuals in
            one browser workstation.
          </p>
          <BrandCredits />
          <p className="brand-version">
            Version {version} · Independent Runpod template
          </p>
          <button type="button" onClick={()=>{setDialog(null);openChangelog();}}>What's new · Changelog</button>
          <p className="brand-license">
            YuE2 model terms: CC BY-NC 4.0. Model and dependency licenses remain
            separate from the application.
          </p>
        </Dialog>
      )}
      {dialog === "shortcuts" && (
        <Dialog titleId="shortcuts-title" onClose={() => setDialog(null)}>
          <div className="modal-title">
            <h2 id="shortcuts-title">Stay in the flow.</h2>
            <button
              aria-label="Close keyboard shortcuts"
              onClick={() => setDialog(null)}
            >
              <X size={18} />
            </button>
          </div>
          {[
            ["Space", "Play / pause"],
            ["Ctrl / ⌘ + S", "Save"],
            ["Ctrl / ⌘ + Z", "Undo"],
            ["Ctrl / ⌘ + Shift + Z", "Redo"],
            ["Ctrl / ⌘ + C / V", "Copy / paste"],
            ["Ctrl / ⌘ + D", "Duplicate"],
            ["Ctrl / ⌘ + A", "Select all clips / notes"],
            ["Delete", "Delete selection"],
            ["S", "Split clips at cursor"],
            ["M", "Mute clip"],
            ["Shift + drag", "Select notes"],
            ["?", "Show shortcuts"],
          ].map(([key, desc]) => (
            <div className="shortcut" key={key}>
              <span>{desc}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </Dialog>
      )}
      {(dialog === "queue" || dialog === "files") && s.project && (
        <Suspense
          fallback={
            <div role="status" className="notice">
              Opening project activity…
            </div>
          }
        >
          <TaskCenter initialTab={dialog} onClose={() => setDialog(null)} />
        </Suspense>
      )}
      {dialog==="agents"&&createPortal(<Suspense fallback={<div role="status">Opening Agents…</div>}><AgentsGuide state={agentGuide} change={patch=>setAgentGuide(old=>({...old,...patch}))} close={closeAgents} setup={openAgentSetup}/></Suspense>,document.body)}
      {dialog==="integrations"&&createPortal(<Suspense fallback={<div role="status">Opening API & Integrations…</div>}><Integrations close={()=>setDialog(null)} initialTab={integrationSetup.tab} initialClient={integrationSetup.client} openAgents={()=>setDialog("agents")}/></Suspense>,document.body)}
      {dialog==="maintenance"&&<Suspense fallback={<div role="status">Opening workstation tools…</div>}><WorkspaceTools close={()=>setDialog(null)}/></Suspense>}
      {auth && s.recovery && <RecoveryDialog key={s.recovery.draft.key || "conflict"}/>}
      {auth===false && s.project && <SessionDialog onSignedIn={()=>{setAuth(true);void save();}}/>}
    </div>
  );
}
