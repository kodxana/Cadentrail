import { automaticVideoLyrics } from "./automaticVideoLyrics";
import {
  HumGuidance,
  MusicAdapterControl,
  InstrumentalForm,
} from "./MusicGuidance";
import { instrumentalDirection } from "./generationPresentation";
import { GenerationNotice } from "./GenerationNotice";
import {
  renderSteps,
  renderLabels,
  renderPresetKey,
  renderingExplanation,
  vocalExplanation,
  revisionExplanation,
} from "./generationPresentation";
import { queueVisual } from "./visualActions";
import { HelpLink, useHelp } from "./Help";
import { tours } from "./helpTours";
import { useEffect, useRef, useState } from "react";
import {
  CreateSteps,
  SongBrief,
  creationSteps,
  useCreateGuide,
} from "./CreateGuide";
import {
  Music2,
  Heart,
  ArrowUpRight,
  RefreshCw,
  Download,
  Image as ImageIcon,
  Film,
  SlidersHorizontal,
  ChevronDown,
  Plus,
  GitBranch,
  ArrowLeft,
  ArrowRight,
  Headphones,
} from "lucide-react";
import {
  useStudio,
  getState,
  setState,
  edit,
  save,
  notice,
  report,
  placeAsset,
} from "./store";
import { post } from "./api";
import { type Job, type Candidate, type Generation, type Asset } from "./model";
import { SongPlayer, SongWave, clock } from "./SongPlayer";
import { Jobs } from "./Jobs";
import { LyricAssistant, type AssistanceAction } from "./LyricAssistant";
const quality = renderSteps;
const voices = [
  ["auto", "Automatic"],
  ["female", "Female"],
  ["male", "Male"],
  ["duet", "Duet"],
  ["dialogue", "Dialogue"],
  ["shared", "Shared vocals"],
  ["instrumental", "Instrumental"],
] as const;
export function Create() {
  const s = useStudio(),
    p = s.project!,
    g = p.generation;
  const instrumental = instrumentalDirection(g);
  const [blind, setBlind] = useState(false),
    [assistant, setAssistant] = useState<AssistanceAction | null>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const generating = s.jobs.some(
    (j) =>
      j.projectId === p.id &&
      j.kind === "generate" &&
      !["Complete", "Failed", "Cancelled"].includes(j.state),
  );
  const guide = useCreateGuide(p.id, p.candidates.length > 0 || generating);
  const { tour } = useHelp();
  const step =
    tour?.id === "create"
      ? (tours.create.steps[tour.step].createStep ?? guide.step)
      : guide.step;
  const { direction, go } = guide;
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      stageRef.current?.scrollTo({ top: 0 });
      stageRef.current
        ?.querySelector<HTMLElement>("h1")
        ?.focus({ preventScroll: true });
      previousStep.current = step;
      if (assistant && step < 2)
        setAssistant(
          step === 0 ? "enhance" : instrumental ? "arrange" : "generate",
        );
    }
  }, [step]);
  const active =
    p.candidates.find((c) => c.id === p.creative.selectedCandidateId) ??
    p.candidates.find((c) => c.favorite) ??
    p.candidates.at(-1);
  const parent = p.candidates.find((c) => c.id === p.creative.parentId);
  const preset = renderPresetKey(p.creative.quality, g.odeSteps);
  const asset =
    s.assets.find((a) => a.id === active?.assetId) ??
    (!p.candidates.length
      ? s.assets.find((a) => a.origin !== "master")
      : undefined);
  const custom =
    p.tracks.some(
      (t) =>
        t.clips.some(
          (c) =>
            c.notes.length > 0 || c.beat > 0 || c.offset > 0 || c.gain !== 1,
        ) ||
        t.effects.length > 0 ||
        t.automation.length > 0 ||
        t.volume !== 0.8 ||
        t.pan !== 0 ||
        t.mute ||
        t.solo ||
        t.output !== "master",
    ) ||
    p.tracks.filter((t) => t.clips.some((c) => c.assetId || c.notes.length))
      .length > 1;
  const queue = async (
    kind: string,
    options: Record<string, unknown> = {},
    source?: Asset,
  ) => {
    await save();
    if (getState().dirty)
      throw new Error("Save the project before starting a job.");
    const latest = getState().project!;
    if (latest.id !== p.id)
      throw new Error(
        "The project changed before this job started. Open it again to continue.",
      );
    const job = await post<Job>("/jobs", {
      projectId: p.id,
      kind,
      generation: latest.generation,
      candidates: kind === "generate" ? latest.creative.candidates : 1,
      parentId: latest.creative.parentId,
      assetId: source?.id,
      options,
    });
    setState({ jobs: [job, ...getState().jobs] });
    notice(
      kind === "generate"
        ? "Your takes are queued."
        : "Queued. You can keep working.",
    );
  };
  const openStudio = (c?: Candidate) => {
    const selected = c ? s.assets.find((a) => a.id === c.assetId) : asset;
    if (
      selected &&
      (!custom || !!c) &&
      !p.tracks.some((t) =>
        t.clips.some((clip) => clip.assetId === selected.id),
      )
    )
      placeAsset(selected);
    localStorage.setItem("studio:experience", "studio");
    setState({ view: "arrange" });
  };
  const generate = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await queue("generate");
      go(3);
    } catch (error) {
      report(error);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const visual = (tab: "artwork" | "video", c?: Candidate) => {
    edit("Choose song for visuals", (p) => {
      if (c) p.creative.selectedCandidateId = c.id;
      p.visuals.video.audioAssetId = c?.assetId ?? asset?.id ?? null;
    });
    setState({ view: "visuals", visualsTab: tab });
  };
  const branch = (c: Candidate, regenerate = false) => {
    const source = c.metadata.generation as Generation | undefined;
    edit("Prepare a revised take", (p) => {
      p.creative.parentId = c.id;
      if (source) p.generation = { ...p.generation, ...source };
      p.generation.seed = Math.floor(Math.random() * 2 ** 31);
      if (c.abc) {
        p.generation.abc = c.abc;
        p.generation.useScore = true;
      }
    });
    if (regenerate) void generate();
    else {
      go(0);
      notice("Revised take ready to edit.");
    }
  };
  const insertSection = (name: string) => {
    const element = lyricsRef.current;
    const start = element?.selectionStart ?? g.lyrics.length,
      end = element?.selectionEnd ?? start;
    edit("Insert lyric section", (p) => {
      p.generation.lyrics =
        g.lyrics.slice(0, start) + `\n[${name}]\n` + g.lyrics.slice(end);
    });
    element?.focus();
  };
  return (
    <main
      className={`create-desk guided-create ${step === 3 ? "at-listen" : ""} ${assistant && step < 2 ? "with-writer" : ""}`}
    >
      <CreateSteps step={step} onGo={go} />

      <section
        className="song-form guide-form"
        aria-label={`${creationSteps[step].name} step`}
      >
        <div
          className="guide-stage"
          key={step}
          data-direction={direction}
          ref={stageRef}
        >
          {parent && step < 3 && (
            <aside className="revision-context" aria-label="Revised take">
              <GitBranch size={18} aria-hidden="true" />
              <div>
                <strong>Revising {parent.name}</strong>
                <p>{revisionExplanation}</p>
              </div>
            </aside>
          )}
          <div className="create-heading">
            <span className="eyebrow">
              STEP {String(step + 1).padStart(2, "0")} ·{" "}
              {creationSteps[step].name.toUpperCase()}
            </span>
            <h1 tabIndex={-1}>
              {step === 3 && generating
                ? "Your song is taking shape."
                : step === 1 && instrumental
                  ? "Let the instruments tell it."
                  : creationSteps[step].title}
            </h1>
            <p>
              {step === 3 && generating
                ? "Takes arrive as they finish. Listen to one while the others are being made."
                : step === 1 && instrumental
                  ? "Shape the sections and musical journey. Your written lyrics stay saved."
                  : creationSteps[step].detail}
            </p>
            <HelpLink
              topic={["prompts", "lyrics", "generation", "takes"][step]}
            />
          </div>
          {custom && (
            <div className="custom-state">
              <SlidersHorizontal size={15} />
              <span>Custom Studio arrangement</span>
              <button onClick={() => openStudio()}>
                Open in Studio <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {step === 0 && (
            <>
              <label className="field guide-song-title">
                <span>
                  Song title <small>Give it a working name</small>
                </span>
                <input
                  aria-label="Song title"
                  maxLength={160}
                  value={p.name}
                  onChange={(e) =>
                    edit("Name song", (project) => {
                      project.name = e.target.value;
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Music description</span>
                <textarea
                  className="music-description"
                  aria-label="Music description"
                  maxLength={8000}
                  value={g.style}
                  placeholder="An intimate acoustic duet, warm guitar, playful verses and a chorus that opens up…"
                  onChange={(e) =>
                    edit("Edit music description", (p) => {
                      p.generation.style = e.target.value;
                    })
                  }
                />
              </label>
              <div className="description-actions">
                <span>Genre, mood, instruments, atmosphere.</span>
                <button
                  aria-pressed={assistant === "enhance"}
                  onClick={() => setAssistant("enhance")}
                >
                  Enhance description
                </button>
              </div>
              <HumGuidance key={p.id} />
              {!g.style.trim() && (
                <div className="idea-starts">
                  <span>NEED A STARTING POINT?</span>
                  {[
                    [
                      "Late-night acoustic",
                      "An intimate acoustic song with warm guitar, honest vocals and a hopeful chorus. A quiet drive home after midnight.",
                    ],
                    [
                      "A little dance-floor energy",
                      "Bright electronic pop, a steady dance groove, expressive vocals and a big uplifting chorus.",
                    ],
                    [
                      "Something cinematic",
                      "A cinematic song with gentle piano, sweeping strings and a dramatic, emotional build.",
                    ],
                  ].map(([label, value]) => (
                    <button
                      key={label}
                      onClick={() =>
                        edit("Choose a starting idea", (project) => {
                          project.generation.style = value;
                        })
                      }
                    >
                      {label}
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <div className="lyric-heading">
                <label htmlFor={instrumental ? undefined : "song-lyrics"}>
                  {instrumental ? "Arrangement" : "Lyrics"}
                </label>
                <div>
                  <button
                    className={instrumental ? "active" : ""}
                    aria-pressed={instrumental}
                    onClick={() =>
                      edit("Instrumental choice", (p) => {
                        p.generation.role = instrumental
                          ? instrumentalDirection({
                              role: "auto",
                              style: g.style,
                            })
                            ? "shared"
                            : "auto"
                          : "instrumental";
                      })
                    }
                  >
                    Instrumental
                  </button>
                  <button
                    aria-pressed={
                      assistant === (instrumental ? "arrange" : "generate")
                    }
                    onClick={() =>
                      setAssistant(instrumental ? "arrange" : "generate")
                    }
                  >
                    {instrumental ? "Suggest arrangement" : "Generate lyrics"}
                  </button>
                </div>
              </div>
              {!instrumental ? (
                <>
                  <textarea
                    ref={lyricsRef}
                    id="song-lyrics"
                    className="simple-lyrics"
                    value={g.lyrics}
                    maxLength={30000}
                    placeholder="Write your lyrics here, or let the lyric assistant suggest a first draft."
                    onChange={(e) =>
                      edit("Edit lyrics", (p) => {
                        p.generation.lyrics = e.target.value;
                      })
                    }
                  />
                  <p className="generation-hint">
                    Write lyrics in the language you want sung and name it in
                    your music description. Pronunciation can vary.
                  </p>
                  <details className="lyric-tools">
                    <summary>
                      <Plus size={13} />
                      Sections & lyric tools
                    </summary>
                    <div className="section-chips">
                      {[
                        "Intro",
                        "Verse",
                        "Pre-Chorus",
                        "Chorus",
                        "Bridge",
                        "Rap",
                        "Instrumental",
                        "Outro",
                      ].map((name) => (
                        <button key={name} onClick={() => insertSection(name)}>
                          {name}
                        </button>
                      ))}
                    </div>
                    <div className="writing-actions">
                      {(["rewrite", "continue", "rhyme"] as const).map(
                        (action) => (
                          <button
                            key={action}
                            onClick={() => setAssistant(action)}
                          >
                            {action === "rhyme"
                              ? "Rhyme ideas"
                              : action === "rewrite"
                                ? "Rewrite"
                                : "Continue"}
                          </button>
                        ),
                      )}
                    </div>
                  </details>
                </>
              ) : (
                <InstrumentalForm />
              )}
              <button
                className="open-writing"
                onClick={() =>
                  setAssistant(instrumental ? "arrange" : "generate")
                }
              >
                {instrumental
                  ? "Open arrangement assistant"
                  : "Open lyric assistant"}{" "}
                <span>
                  {p.creative.lyricDrafts.length
                    ? `${p.creative.lyricDrafts.length} saved drafts`
                    : "Choose a model · review drafts"}
                </span>
                <ArrowUpRight size={14} />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <div className="simple-options">
                <label className="field">
                  <span>Vocal direction</span>
                  <select
                    aria-label="Vocal direction"
                    aria-describedby="create-vocal-hint"
                    value={g.role}
                    onChange={(e) =>
                      edit("Choose vocals", (p) => {
                        p.generation.role = e.target
                          .value as Generation["role"];
                      })
                    }
                  >
                    {voices.map(([v, label]) => (
                      <option value={v} key={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <small id="create-vocal-hint" className="field-hint">
                    {vocalExplanation(g.role)}
                  </small>
                </label>
                <label className="field">
                  <span>Rendering preset</span>
                  <select
                    value={preset}
                    aria-label="Rendering preset"
                    aria-describedby="create-render-hint"
                    onChange={(e) =>
                      edit("Rendering preset", (p) => {
                        p.creative.quality = e.target
                          .value as keyof typeof quality;
                        p.generation.odeSteps =
                          quality[e.target.value as keyof typeof quality];
                      })
                    }
                  >
                    {Object.keys(quality).map((key) => (
                      <option key={key} value={key}>
                        {renderLabels[key as keyof typeof quality]}
                      </option>
                    ))}
                    {preset === "custom" && (
                      <option value="custom" disabled>
                        Custom Studio settings
                      </option>
                    )}
                  </select>
                </label>
              </div>
              <p id="create-render-hint" className="generation-hint">
                {renderingExplanation}
              </p>
              <p className="generation-hint">
                Length follows the lyrics and composition. Exact duration is not
                guaranteed.
              </p>
              <div className="takes-choice">
                <div>
                  <strong>How many takes?</strong>
                  <small>More possibilities, more generation time.</small>
                </div>
                <div className="segmented">
                  {([1, 2, 4, 8] as const).map((n) => (
                    <button
                      key={n}
                      className={p.creative.candidates === n ? "active" : ""}
                      aria-pressed={p.creative.candidates === n}
                      onClick={() =>
                        edit("Candidate count", (p) => {
                          p.creative.candidates = n;
                        })
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <details className="advanced-generation">
                <summary>
                  Advanced controls <ChevronDown size={14} />
                </summary>
                <MusicAdapterControl />
                {g.hum && (
                  <p className="generation-hint">
                    A hummed melody is attached. It uses melody planning for
                    this take.
                  </p>
                )}
                {g.useScore && (
                  <div className="custom-state">
                    Using your edited Studio score.{" "}
                    <button onClick={() => setState({ view: "notation" })}>
                      Open score
                    </button>
                  </div>
                )}
                <label className="field">
                  <span>Sampling variation · {g.temperature.toFixed(2)}</span>
                  <input
                    type="range"
                    min=".3"
                    max="1.5"
                    step=".05"
                    value={g.temperature}
                    onChange={(e) =>
                      edit("Sampling variation", (p) => {
                        p.generation.temperature = +e.target.value;
                      })
                    }
                  />
                </label>
                <div className="simple-options">
                  <label className="field">
                    <span>Seed</span>
                    <div className="inline-field">
                      <input
                        type="number"
                        aria-label="Generation seed"
                        min="0"
                        max={2 ** 53 - 9}
                        value={g.seed}
                        onChange={(e) =>
                          edit("Seed", (p) => {
                            p.generation.seed = Math.max(
                              0,
                              Math.min(2 ** 53 - 9, +e.target.value),
                            );
                          })
                        }
                      />
                      <button
                        title="New seed"
                        onClick={() =>
                          edit("Random seed", (p) => {
                            p.generation.seed = Math.floor(
                              Math.random() * 2 ** 31,
                            );
                          })
                        }
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </label>
                  <label className="field">
                    <span>Planning</span>
                    <select
                      value={g.cot}
                      onChange={(e) => {
                        if (e.target.value === "off" && g.useScore) {
                          notice(
                            "Uncheck the edited score before choosing direct generation.",
                          );
                          return;
                        }
                        edit("Planning mode", (p) => {
                          p.generation.cot = e.target
                            .value as Generation["cot"];
                        });
                      }}
                    >
                      <option value="full">Melody + chords</option>
                      <option value="melody">Melody only</option>
                      <option value="off">Direct</option>
                    </select>
                  </label>
                </div>
                <div className="simple-options">
                  <label className="field">
                    <span>Text guidance · optional</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step=".1"
                      value={g.cfgScale ?? ""}
                      placeholder="Model default"
                      onChange={(e) =>
                        edit("Guidance", (p) => {
                          p.generation.cfgScale =
                            e.target.value === "" ? null : +e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Render steps</span>
                    <input
                      type="number"
                      min="8"
                      max="64"
                      value={g.odeSteps}
                      onChange={(e) =>
                        edit("Render steps", (p) => {
                          p.generation.odeSteps = Math.max(
                            8,
                            Math.min(64, +e.target.value),
                          );
                          p.creative.quality = "custom";
                        })
                      }
                    />
                  </label>
                </div>
                <div className="simple-options">
                  <label className="field">
                    <span>Top P</span>
                    <input
                      type="number"
                      min=".5"
                      max="1"
                      step=".01"
                      value={g.topP}
                      onChange={(e) =>
                        edit("Sampling", (p) => {
                          p.generation.topP = +e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Top K</span>
                    <input
                      type="number"
                      min="10"
                      max="200"
                      value={g.topK}
                      onChange={(e) =>
                        edit("Sampling", (p) => {
                          p.generation.topK = +e.target.value;
                        })
                      }
                    />
                  </label>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={g.useScore}
                    disabled={!g.abc || g.cot === "off"}
                    onChange={(e) =>
                      edit("Use edited score", (p) => {
                        p.generation.useScore = e.target.checked;
                      })
                    }
                  />
                  Use edited Studio score
                </label>
                <button
                  disabled={!s.status.available || !g.style.trim()}
                  onClick={() => void queue("plan").catch(report)}
                >
                  Plan score only
                </button>
                <p className="help">
                  Rendering presets use 16 / 32 / 48 / 64 synthesis steps.
                  Sampling settings affect variation; they cannot guarantee
                  musical quality.
                </p>
              </details>
            </>
          )}
          {step === 3 && (
            <div className="listen-guide">
              <Headphones size={32} strokeWidth={1.3} />
              <ol>
                <li>
                  <strong>Listen to each take</strong>
                  <span>Switch takes to compare the same moment.</span>
                </li>
                <li>
                  <strong>Keep what you love</strong>
                  <span>Tap the heart. Every version stays saved.</span>
                </li>
                <li>
                  <strong>Make it a release</strong>
                  <span>
                    Add artwork, create a music video, or open Studio.
                  </span>
                </li>
              </ol>
              <button onClick={() => go(0)}>
                Edit your song idea <ArrowRight size={15} />
              </button>
              <button onClick={() => go(2)}>
                Make more takes <ArrowRight size={15} />
              </button>
              {generating && (
                <small role="status">
                  Generation is running. You can keep exploring.
                </small>
              )}
            </div>
          )}
        </div>
        <div className="guide-footer">
          {step > 0 && (
            <button className="guide-back" onClick={() => go(step - 1)}>
              <ArrowLeft size={15} /> Back
            </button>
          )}
          {step < 2 ? (
            <div className="guide-forward">
              <button
                className="primary"
                disabled={step === 0 && !g.style.trim()}
                onClick={() => go(step + 1)}
              >
                {step === 0 ? "Next: the words" : "Next: the performance"}
                <ArrowRight size={17} />
              </button>
              <small>
                {step === 0
                  ? "Start with a description. You can refine it later."
                  : instrumental
                    ? "Your lyrics are kept if you change your mind."
                    : !g.lyrics.trim()
                      ? "You can continue without lyrics and come back later."
                      : "Your words stay editable throughout."}
              </small>
            </div>
          ) : step === 2 ? (
            <div className="guide-forward">
              <button
                className="primary generate-song"
                disabled={submitting || !s.status.available || !g.style.trim()}
                onClick={() => void generate()}
              >
                <Music2 size={18} />
                {submitting ? (
                  "Starting your song…"
                ) : (
                  <>
                    Generate{" "}
                    {p.creative.candidates === 1
                      ? "song"
                      : p.creative.candidates + " takes"}
                  </>
                )}
              </button>
              <small>
                {!g.style.trim()
                  ? "Add a music description in Sound first."
                  : s.status.available
                    ? "YuE2 · saved as new takes · optional downloads ask first"
                    : "Open the Runpod workstation to generate"}
              </small>
            </div>
          ) : (
            <span className="guide-finish">
              Your project. Every version kept.
            </span>
          )}
        </div>
      </section>
      {assistant && (
        <div className="guide-writer" hidden={step >= 2}>
          <LyricAssistant
            key={p.id}
            action={assistant}
            onActionChange={setAssistant}
            onClose={() => setAssistant(null)}
          />
        </div>
      )}
      {(!assistant || step >= 2) &&
        (step < 3 ? (
          <SongBrief project={p} step={step} onGo={go} />
        ) : (
          <section className="listening-desk">
            <div className="results-heading">
              <div>
                <span className="eyebrow">YOUR SONG</span>
                <h2>{p.name}</h2>
              </div>
              <button onClick={() => openStudio()}>
                <SlidersHorizontal size={15} />
                Open in Studio
              </button>
            </div>
            <Jobs
              kinds={["generate", "plan", "lyrics", "separate", "master"]}
            />
            {asset && (
              <SongPlayer
                assetId={asset.id}
                name={blind ? "Selected take" : (active?.name ?? asset.name)}
                duration={asset.duration}
              />
            )}
            <div className="takes-heading">
              <h3>
                {p.candidates.length}{" "}
                {p.candidates.length === 1 ? "take" : "takes"}
              </h3>
              {p.candidates.length > 1 && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={blind}
                    onChange={(e) => setBlind(e.target.checked)}
                  />
                  Blind comparison
                </label>
              )}
            </div>
            {!p.candidates.length && !asset && (
              <div className="empty-song">
                <Music2 size={42} />
                <h3>
                  {generating
                    ? "Making room for your first take."
                    : "Ready when you are."}
                </h3>
                <p>
                  {generating
                    ? "Follow the real progress above. Your song will appear here as soon as it’s ready."
                    : "Finish your sound, words and performance choices, then generate your first song."}
                </p>
                {!generating && (
                  <button onClick={() => go(g.style.trim() ? 2 : 0)}>
                    Continue creating <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
            {p.candidates.length > 0 && (
              <p className="generation-hint revision-hint">
                {revisionExplanation}
              </p>
            )}
            <div className="song-takes">
              {p.candidates.map((c, i) => {
                const a = s.assets.find((a) => a.id === c.assetId);
                return (
                  <article
                    className={
                      "song-take " + (active?.id === c.id ? "selected" : "")
                    }
                    key={c.id}
                  >
                    <div className="take-head">
                      <button
                        className="take-index"
                        title="Compare at the same playback position"
                        onClick={() =>
                          edit("Select take", (p) => {
                            p.creative.selectedCandidateId = c.id;
                          })
                        }
                      >
                        {String(i + 1).padStart(2, "0")}
                      </button>
                      {blind ? (
                        <strong>Take {String.fromCharCode(65 + i)}</strong>
                      ) : (
                        <input
                          aria-label="Candidate name"
                          value={c.name}
                          onChange={(e) =>
                            edit("Rename take", (p) => {
                              p.candidates.find((x) => x.id === c.id)!.name =
                                e.target.value;
                            })
                          }
                        />
                      )}
                      <span>{a ? clock(a.duration) : "Score"}</span>
                      <button
                        aria-label="Favorite candidate"
                        className={c.favorite ? "favorite" : ""}
                        onClick={() =>
                          edit("Favorite take", (p) => {
                            p.candidates.find((x) => x.id === c.id)!.favorite =
                              !c.favorite;
                          })
                        }
                      >
                        <Heart
                          size={17}
                          fill={c.favorite ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    <GenerationNotice
                      value={c.metadata.truncated}
                      onPrepare={() => branch(c)}
                    />
                    {a && (
                      <button
                        className="wave-select"
                        onClick={() =>
                          edit("Compare take", (p) => {
                            p.creative.selectedCandidateId = c.id;
                          })
                        }
                        aria-label={"Select " + c.name + " for playback"}
                      >
                        <SongWave assetId={a.id} />
                      </button>
                    )}
                    <div className="take-actions">
                      <button onClick={() => openStudio(c)}>
                        <ArrowUpRight size={14} />
                        Studio
                      </button>
                      {a && (
                        <a
                          className="button"
                          href={"/api/assets/" + a.id + "/audio"}
                          download={c.name + ".wav"}
                        >
                          <Download size={14} />
                          Download
                        </a>
                      )}
                      <button
                        title={revisionExplanation}
                        onClick={() => branch(c)}
                      >
                        <GitBranch size={14} />
                        Create a revised take
                      </button>
                      <details>
                        <summary>
                          More <ChevronDown size={12} />
                        </summary>
                        <div className="take-menu">
                          <button onClick={() => branch(c, true)}>
                            Generate another complete take
                          </button>
                          <button
                            onClick={() => {
                              branch(c);
                              go(1);
                            }}
                          >
                            Revise lyrics / style
                          </button>
                          <button
                            disabled={!a || !s.status.stemsAvailable}
                            onClick={() =>
                              a && void queue("separate", {}, a).catch(report)
                            }
                          >
                            Separate stems
                          </button>
                          <button
                            disabled={!a}
                            onClick={() =>
                              a &&
                              void queue(
                                "master",
                                { format: "wav", lufs: -14 },
                                a,
                              ).catch(report)
                            }
                          >
                            Master a copy
                          </button>
                          <button onClick={() => visual("artwork", c)}>
                            Create artwork
                          </button>
                          <button onClick={() => visual("video", c)}>
                            Create music video
                          </button>
                          {c.abc && (
                            <button
                              onClick={() => {
                                edit("Inspect candidate score", (p) => {
                                  p.generation.abc = c.abc;
                                  p.generation.useScore = true;
                                  if (p.generation.cot === "off")
                                    p.generation.cot = "full";
                                });
                                setState({ view: "notation" });
                              }}
                            >
                              Inspect score
                            </button>
                          )}
                          <label>
                            Rating
                            <select
                              value={c.rank}
                              onChange={(e) =>
                                edit("Rate take", (p) => {
                                  p.candidates.find(
                                    (x) => x.id === c.id,
                                  )!.rank = +e.target.value;
                                })
                              }
                            >
                              {[0, 1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n ? "★".repeat(n) : "Unrated"}
                                </option>
                              ))}
                            </select>
                          </label>
                          <details>
                            <summary>Generation details</summary>
                            <pre>
                              {JSON.stringify(
                                {
                                  seed: c.seed,
                                  parent: c.parentId,
                                  ...c.metadata,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        </div>
                      </details>
                    </div>
                  </article>
                );
              })}
            </div>
            {asset && (
              <div className="next-steps">
                <button onClick={() => visual("artwork")}>
                  <ImageIcon size={21} />
                  <span>
                    <strong>Create artwork</strong>
                    <small>Give your song a cover.</small>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
                <button
                  onClick={() => {
                    visual("video");
                    if (asset)
                      void queueVisual(
                        "music-video",
                        {
                          style: "cinematic",
                          preset: "1080p",
                          lyrics: automaticVideoLyrics(p, s.assets, asset.id),
                        },
                        asset.id,
                      ).catch(report);
                  }}
                >
                  <Film size={21} />
                  <span>
                    <strong>Create music video</strong>
                    <small>Automatically designed. Ready to share.</small>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              </div>
            )}
            {s.assets.some((a) => a.origin === "master") && (
              <div className="masters-list">
                <h3>Mastered copies</h3>
                {s.assets
                  .filter((a) => a.origin === "master")
                  .map((a) => (
                    <a
                      key={a.id}
                      href={"/api/assets/" + a.id + "/audio"}
                      download
                    >
                      {a.name}
                      <Download size={14} />
                    </a>
                  ))}
              </div>
            )}
          </section>
        ))}
    </main>
  );
}
