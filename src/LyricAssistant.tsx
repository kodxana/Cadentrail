import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Feather,
  Send,
  Music2,
  AudioLines,
  RefreshCw,
} from "lucide-react";
import { api, post } from "./api";
import {
  edit,
  getState,
  notice,
  report,
  save,
  setState,
  useStudio,
} from "./store";
import { type Job } from "./model";
import { Jobs } from "./Jobs";
import { applyDraft, draftContext } from "./lyrics";
import { instrumentalDirection } from "./generationPresentation";
const operations = {
  generate: "New lyrics",
  rewrite: "Rewrite",
  continue: "Continue",
  rhyme: "Rhyme ideas",
  enhance: "Music description",
  arrange: "Instrumental arrangement",
};
export type AssistanceAction = keyof typeof operations;
type Model = {
  id: string;
  name: string;
  description: string;
  downloadGiB?: number;
};
type Providers = {
  text: {
    available: boolean;
    model: string;
    models: Model[];
    languages?: { id: string; name: string }[];
  };
};
const contexts = {
  description: {
    label: "Description",
    title: "Find your sound.",
    icon: Music2,
    target: "Music description",
    help: "Explore the genre, mood and instrumentation. Review a suggestion before replacing your description.",
    placeholder: "Warmer guitars, a softer opening, a bigger chorus…",
    submit: "Draft description",
  },
  lyrics: {
    label: "Lyrics",
    title: "Find the words.",
    icon: Feather,
    target: "Lyrics",
    help: "Write, rewrite or continue your words. Every applied version stays in draft history.",
    placeholder:
      "A playful duet about coffee at 3 AM. Short verses, a memorable chorus…",
    submit: "Write a draft",
  },
  arrangement: {
    label: "Arrangement",
    title: "Give the music a shape.",
    icon: AudioLines,
    target: "Instrumental sections",
    help: "Suggest an order of sections. This guides the instrumental composition; exact timing and the Studio timeline stay under your control.",
    placeholder:
      "A quiet opening, two contrasting themes, a return to the main theme and a gentle outro…",
    submit: "Suggest arrangement",
  },
};
export function LyricAssistant({
  action,
  onActionChange,
  onClose,
}: {
  action: AssistanceAction;
  onActionChange: (action: AssistanceAction) => void;
  onClose: () => void;
}) {
  const s = useStudio(),
    p = s.project!;
  const instrumental = instrumentalDirection(p.generation);
  const operation =
    instrumental && draftContext(action) === "lyrics"
      ? "arrange"
      : !instrumental && action === "arrange"
        ? "generate"
        : action;
  const context = draftContext(operation),
    info = contexts[context];
  const [providers, setProviders] = useState<Providers | null>(null),
    [providerError, setProviderError] = useState(""),
    [retry, setRetry] = useState(0),
    [directions, setDirections] = useState<Record<string, string>>({}),
    [selections, setSelections] = useState<Record<string, string>>({}),
    [edits, setEdits] = useState<Record<string, string>>({}),
    [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const desk = useRef<HTMLElement>(null);
  useEffect(() => {
    desk.current?.scrollTo({ top: 0 });
  }, [context]);
  useEffect(() => {
    const controller = new AbortController();
    setProviders(null);
    setProviderError("");
    void api<Providers>("/providers", { signal: controller.signal })
      .then(setProviders)
      .catch((error) => {
        if (!controller.signal.aborted)
          setProviderError(
            error instanceof Error ? error.message : String(error),
          );
      });
    return () => controller.abort();
  }, [retry]);
  const drafts = p.creative.lyricDrafts.filter(
    (d) => draftContext(d.operation) === context,
  );
  const selected =
    drafts.find((d) => d.id === selections[context]) ?? drafts.at(-1);
  const text = selected ? (edits[selected.id] ?? selected.text) : "";
  const latest = p.creative.lyricDrafts.at(-1);
  const seenDraft = useRef(latest?.id);
  useEffect(() => {
    if (
      latest &&
      latest.id !== seenDraft.current &&
      latest.model !== "Your writing"
    ) {
      const target = draftContext(latest.operation);
      setSelections((prev) => ({ ...prev, [target]: latest.id }));
    }
    seenDraft.current = latest?.id;
  }, [latest?.id]);
  const model =
    p.creative.assistanceModel ?? providers?.text.model ?? "Qwen/Qwen3-4B";
  const modelInfo = providers?.text.models.find((m) => m.id === model);
  const needsLyrics =
    ["rewrite", "continue", "rhyme"].includes(operation) &&
    !p.generation.lyrics.trim();
  const blocked = providerError
    ? "Could not check assistance models. Retry the connection."
    : !providers
      ? "Checking assistance models…"
      : !providers.text.available
        ? "Writing needs the Runpod GPU workstation. You can still edit descriptions, lyrics and sections manually here."
        : !modelInfo
          ? "This project's writing model is unavailable here. Choose a model above."
          : needsLyrics
            ? "Add some lyrics first, or choose New lyrics."
            : "";
  const queue = async () => {
    if (submitting.current || blocked) return;
    submitting.current = true;
    setPending(true);
    try {
      await save();
      if (getState().dirty)
        throw new Error("Save the project before asking the assistant.");
      const current = getState().project;
      if (current?.id !== p.id)
        throw new Error(
          "The project changed. Open the assistant again to continue.",
        );
      const job = await post<Job>("/jobs", {
        projectId: current.id,
        kind: "lyrics",
        options: {
          model,
          language: current.creative.assistanceLanguage ?? "auto",
          operation,
          title: current.name,
          style: current.generation.style,
          lyrics: instrumental ? "" : current.generation.lyrics,
          instrumental,
          sections: current.generation.instrumentalSections ?? "[instrumental]",
          direction: directions[context] ?? "",
          seed: current.generation.seed,
        },
      });
      setState({ jobs: [job, ...getState().jobs] });
      notice(info.label + " draft queued. You can keep editing while it runs.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  const apply = (append = false) => {
    if (!selected) return;
    try {
      edit("Apply reviewed " + context, (project) =>
        applyDraft(project, selected, text, append),
      );
    } catch (error) {
      report(error);
      return;
    }
    notice(info.target + " updated. The previous version is saved in drafts.");
  };
  return (
    <aside ref={desk} className="writing-desk" aria-label="Song assistant">
      <div className="writing-title">
        <div>
          <span className="eyebrow">SONG ASSISTANT</span>
          <h2>{info.title}</h2>
        </div>
        <button onClick={onClose}>
          <ArrowLeft size={14} /> Back to my song
        </button>
      </div>
      <div
        className="assistant-contexts"
        role="group"
        aria-label="Assistance focus"
      >
        {(
          ["description", instrumental ? "arrangement" : "lyrics"] as const
        ).map((key) => {
          const item = contexts[key],
            Icon = item.icon;
          return (
            <button
              key={key}
              aria-pressed={key === context}
              onClick={() =>
                onActionChange(
                  key === "description"
                    ? "enhance"
                    : key === "arrangement"
                      ? "arrange"
                      : "generate",
                )
              }
            >
              <Icon size={17} />
              <span>{item.label}</span>
              {key === context && <Check size={14} />}
            </button>
          );
        })}
      </div>
      <div className="assistant-focus" aria-live="polite">
        <strong>Working on: {info.target}</strong>
        <p>{info.help}</p>
        {instrumental && (
          <small>
            Instrumental mode · lyric-writing tools return when vocals are
            enabled. Saved lyrics are kept.
          </small>
        )}
      </div>
      <div className="assistant-request">
        {context === "lyrics" && (
          <div
            className="writing-actions"
            role="group"
            aria-label="Writing task"
          >
            {(["generate", "rewrite", "continue", "rhyme"] as const).map(
              (key) => (
                <button
                  key={key}
                  aria-pressed={key === operation}
                  onClick={() => onActionChange(key)}
                >
                  {operations[key]}
                </button>
              ),
            )}
          </div>
        )}
        {context === "lyrics" && (
          <label className="field">
            <span>Lyric language</span>
            <select
              aria-label="Lyric language"
              value={p.creative.assistanceLanguage ?? "auto"}
              onChange={(e) =>
                edit("Choose lyric language", (p) => {
                  p.creative.assistanceLanguage = e.target.value;
                })
              }
            >
              {(
                providers?.text.languages ?? [
                  { id: "auto", name: "From music description" },
                ]
              ).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <small className="field-hint">
              Automatic follows the language in your direction or music
              description, including J-pop / Japanese. With no language named,
              rewriting keeps the existing lyric language; new lyrics default to
              English. Language checks are estimates; review the draft.
            </small>
          </label>
        )}
        <label className="field">
          <span>
            {context === "description"
              ? "What should change?"
              : "Creative direction"}
          </span>
          <textarea
            aria-label="Writing direction"
            rows={3}
            maxLength={4000}
            value={directions[context] ?? ""}
            onChange={(e) =>
              setDirections({ ...directions, [context]: e.target.value })
            }
            placeholder={info.placeholder}
          />
        </label>
        <label className="field">
          <span>Assistance model</span>
          <select
            aria-label="Assistance model"
            value={model}
            onChange={(e) =>
              edit("Choose writing model", (p) => {
                p.creative.assistanceModel = e.target.value;
              })
            }
          >
            {(
              providers?.text.models ?? [
                { id: model, name: model.split("/").at(-1)!, description: "" },
              ]
            ).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.description}
              </option>
            ))}
            {providers && !modelInfo && (
              <option value={model}>{model} · unavailable here</option>
            )}
          </select>
        </label>
        <small className="model-note">
          {modelInfo?.downloadGiB
            ? "About " + modelInfo.downloadGiB + " GiB if not installed. "
            : ""}
          Missing models ask before downloading. Music and writing take turns on
          the GPU.
        </small>
        {blocked && (
          <div className="assistant-availability" role="status">
            <span>{blocked}</span>
            {(providerError || (providers && !providers.text.available)) && (
              <button onClick={() => setRetry(retry + 1)}>
                <RefreshCw size={13} />
                Retry connection
              </button>
            )}
          </div>
        )}
        <div className="writing-submit">
          <span>
            Result goes to {info.label.toLowerCase()} drafts for your review.
          </span>
          <button
            className="primary"
            disabled={pending || !!blocked}
            onClick={() => void queue().catch(report)}
          >
            <Send size={14} />
            {pending ? "Queuing…" : info.submit}
          </button>
        </div>
      </div>
      <Jobs kinds={["lyrics"]} />
      <div className="draft-heading">
        <h3>
          {info.label} drafts <span>{drafts.length}</span>
        </h3>
        <small>Review, edit, then use.</small>
      </div>
      {selected ? (
        <div className="draft-review">
          <div
            className="draft-index"
            aria-label={"Saved " + info.label.toLowerCase() + " drafts"}
          >
            {[...drafts].reverse().map((d) => (
              <button
                key={d.id}
                aria-pressed={d.id === selected.id}
                onClick={() =>
                  setSelections({ ...selections, [context]: d.id })
                }
              >
                <strong>
                  {operations[d.operation as AssistanceAction] ??
                    (d.operation.startsWith("before")
                      ? "Previous version"
                      : "Edited draft")}
                </strong>
                <span>
                  {d.model.split("/").at(-1) || "Your writing"} ·{" "}
                  {new Date(d.createdAt * 1000).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <small>{d.text.replace(/\n/g, " ").slice(0, 90)}</small>
              </button>
            ))}
          </div>
          <div className="draft-editor">
            <label htmlFor="reviewed-draft">
              {info.target} · editable suggestion
            </label>
            <textarea
              id="reviewed-draft"
              maxLength={
                context === "description"
                  ? 8000
                  : context === "arrangement"
                    ? 2000
                    : 30000
              }
              value={text}
              onChange={(e) =>
                setEdits({ ...edits, [selected.id]: e.target.value })
              }
            />
            <div className="draft-footer">
              <span>
                {selected.model || "Your writing"}
                {selected.language &&
                  " · " +
                    (providers?.text.languages?.find(
                      (l) => l.id === selected.language,
                    )?.name ?? selected.language)}
              </span>
              <button
                disabled={!text.trim()}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(text)
                    .then(() => notice("Draft copied."))
                    .catch(report)
                }
              >
                <Copy size={13} />
                Copy
              </button>
              <button
                className="primary"
                disabled={!text.trim()}
                onClick={() =>
                  apply(["continue", "rhyme"].includes(selected.operation))
                }
              >
                <Check size={13} />
                {context === "description"
                  ? "Use description"
                  : context === "arrangement"
                    ? "Use arrangement"
                    : selected.operation === "continue"
                      ? "Append continuation"
                      : selected.operation === "rhyme"
                        ? "Append ideas"
                        : "Use these lyrics"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-drafts">
          <info.icon size={30} />
          <h3>
            {context === "lyrics"
              ? "A first draft is a starting point."
              : "Your " +
                info.label.toLowerCase() +
                " drafts will appear here."}
          </h3>
          <p>
            Give the assistant a direction, then review its suggestion before
            applying.
          </p>
        </div>
      )}
    </aside>
  );
}
