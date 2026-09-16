import { useEffect, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  Search,
  X,
  ArrowUpRight,
  RefreshCw,
  FileAudio,
  FileText,
  Image,
  Film,
} from "lucide-react";
import { api } from "./api";
import {
  getState,
  notice,
  placeAsset,
  refreshCandidates,
  report,
  save,
  setState,
  useStudio,
} from "./store";
import {
  JobActions,
  ModelDownloads,
  JobProgress,
  jobName,
  jobKind,
  lane,
  terminal,
  useNow,
} from "./Jobs";
import { SongPlayer } from "./SongPlayer";
type Entry = {
  id: string;
  name: string;
  kind: string;
  extension: string;
  size: number;
  createdAt: number;
  jobId: string | null;
  sourceName: string;
  location: string;
  url: string;
  assetId?: string;
};
const bytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(1)} GB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;
export function TaskCenter({
  initialTab,
  onClose,
}: {
  initialTab: "queue" | "files";
  onClose: () => void;
}) {
  const s = useStudio(),
    p = s.project!,
    now = useNow(),
    dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState(initialTab),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [files, setFiles] = useState<Entry[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [outputJob, setOutputJob] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [preview, setPreview] = useState("");
  const refresh = async () => {
    setLoading(true);
    try {
      setFiles(await api<Entry[]>(`/projects/${p.id}/files`));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const completed = s.jobs.filter(
    (j) => j.projectId === p.id && terminal(j),
  ).length;
  useEffect(() => {
    void refresh().catch(report);
  }, [p.id, p.revision, completed]);
  const entry = files.find((f) => f.id === selected);
  useEffect(() => {
    setPreview("");
    if (
      !entry ||
      ["Audio", "Video", "Artwork", "Tokens", "MIDI"].includes(entry.kind)
    )
      return;
    const controller = new AbortController();
    void fetch(entry.url, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not read file");
        setPreview((await r.text()).slice(0, 50000));
      })
      .catch((e) => {
        if (e.name !== "AbortError") report(e);
      });
    return () => controller.abort();
  }, [selected, entry?.url]);
  const children = new Set(
    s.jobs.flatMap((j) => Object.values(j.children ?? {})),
  );
  const jobs = s.jobs.filter(
    (j) => j.projectId === p.id && !children.has(j.id),
  );
  const active = jobs.filter((j) => !terminal(j));
  const words = query.toLowerCase().trim();
  const foundJobs = jobs.filter(
    (j) =>
      (filter === "All" ||
        (filter === "Active" && !terminal(j)) ||
        filter === j.state) &&
      `${jobName(j)} ${j.message} ${j.state} ${j.id}`
        .toLowerCase()
        .includes(words),
  );
  const descendantIds = (jobId: string) => {
    const result = new Set([jobId]);
    const job = s.jobs.find((j) => j.id === jobId);
    Object.values(job?.children ?? {}).forEach((x) => result.add(x));
    return result;
  };
  const resultIds = outputJob ? descendantIds(outputJob) : null;
  const foundFiles = files.filter(
    (f) =>
      (filter === "All" || filter === f.kind) &&
      (!resultIds || (f.jobId && resultIds.has(f.jobId))) &&
      `${f.name} ${f.extension} ${f.kind} ${f.sourceName}`
        .toLowerCase()
        .includes(words),
  );
  const navigate = (
    view: "arrange" | "visuals",
    visualsTab: "assets" | "timing" = "assets",
  ) => {
    setState({ view, visualsTab });
    onClose();
  };
  const rename = async (value: string) => {
    if (!entry || value.trim() === entry.name) return;
    await save();
    if (getState().dirty)
      throw new Error("Save your edits before renaming a file.");
    await api(`/projects/${p.id}/files/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: value }),
    });
    await refreshCandidates();
    await refresh();
    notice("File renamed.");
  };
  return (
    <dialog
      ref={dialog}
      className="task-center"
      onCancel={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label="Project queue and files"
    >
      <div className="task-center-heading">
        <div>
          <span className="eyebrow">{p.name}</span>
          <h2>Project activity</h2>
        </div>
        <button autoFocus aria-label="Close project activity" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="task-center-tabs">
        <button
          className={tab === "queue" ? "active" : ""}
          onClick={() => {
            setTab("queue");
            setFilter("All");
            setOutputJob(null);
          }}
        >
          Queue <span>{active.length} active</span>
        </button>
        <button
          className={tab === "files" ? "active" : ""}
          onClick={() => {
            setTab("files");
            setFilter("All");
            setOutputJob(null);
          }}
        >
          <FolderOpen size={15} />
          Files <span>{files.length}</span>
        </button>
        <div className="spacer" />
        <small>Saved with this project</small>
      </div>
      <div className="finder-search">
        <Search size={16} />
        <input
          autoComplete="off"
          aria-label={tab === "queue" ? "Search queue" : "Find a file"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            tab === "queue"
              ? "Find a job, stage or result…"
              : "Find songs, artwork, videos, lyrics, scores…"
          }
        />
        <select
          aria-label="Filter project activity"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {(tab === "queue"
            ? ["All", "Active", "Complete", "Failed", "Cancelled"]
            : [
                "All",
                "Audio",
                "Artwork",
                "Video",
                "Score",
                "Lyrics",
                "Timing",
                "Tokens",
                "Metadata",
                "MIDI",
              ]
          ).map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <button
          aria-label="Refresh files"
          disabled={loading}
          onClick={() => void refresh().catch(report)}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {outputJob && (
        <div className="output-filter">
          Outputs from{" "}
          {jobKind(s.jobs.find((j) => j.id === outputJob)?.kind ?? "job")}
          <button onClick={() => setOutputJob(null)}>Show all files</button>
        </div>
      )}
      {tab === "queue" ? (
        <div className="queue-list">
          {!foundJobs.length && (
            <div className="finder-empty">
              {query || filter !== "All"
                ? "No jobs match this search."
                : "Your generation and rendering jobs will appear here."}
            </div>
          )}
          {foundJobs.map((j) => {
            const outputs = files.filter(
              (f) => f.jobId && descendantIds(j.id).has(f.jobId),
            );
            const laneAhead =
              s.jobs
                .filter((x) => x.state === "Queued" && lane(x) === lane(j))
                .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
                .findIndex((x) => x.id === j.id) + 1;
            return (
              <article
                className={`queue-item ${j.state.toLowerCase()}`}
                key={j.id}
              >
                <div className="queue-item-title">
                  <div>
                    <strong>{jobName(j)}</strong>
                    <span>
                      {lane(j)} queue
                      {j.state === "Queued"
                        ? ` · position ${laneAhead}`
                        : ""} ·{" "}
                      {new Date(
                        (j.createdAt ?? j.updatedAt) * 1000,
                      ).toLocaleString()}
                    </span>
                  </div>
                  <JobActions job={j} />
                </div>
                <JobProgress job={j} now={now} />
                <ModelDownloads job={j} />
                {j.state === "Failed" && (
                  <p className="queue-error">{j.message}</p>
                )}
                {!!outputs.length && (
                  <div className="job-outputs">
                    {outputs.slice(0, 3).map((f) => (
                      <a
                        key={f.id}
                        href={f.url}
                        download={`${f.name}.${f.extension}`}
                      >
                        <Download size={12} />
                        {f.name}
                        <span>{f.extension.toUpperCase()}</span>
                      </a>
                    ))}
                    <button
                      onClick={() => {
                        setOutputJob(j.id);
                        setTab("files");
                        setFilter("All");
                        setQuery("");
                        setSelected(outputs[0].id);
                      }}
                    >
                      View {outputs.length} files <ArrowUpRight size={13} />
                    </button>
                  </div>
                )}
                {Object.entries(j.children ?? {}).length > 0 && (
                  <details className="child-jobs">
                    <summary>Workflow steps</summary>
                    {Object.entries(j.children!).map(([stage, key]) => {
                      const child = s.jobs.find((x) => x.id === key);
                      return (
                        <div key={key}>
                          <span>{stage}</span>
                          <strong>{child?.state ?? "Saved"}</strong>
                          {child && !terminal(child) && (
                            <JobProgress job={child} now={now} />
                          )}
                        </div>
                      );
                    })}
                  </details>
                )}
              </article>
            );
          })}
          <p className="queue-footnote">
            The queue keeps the latest 200 jobs. Completed files remain in your
            project. GPU work and video rendering use separate queues.
          </p>
        </div>
      ) : (
        <div className="file-finder">
          <div className="file-list">
            {!foundFiles.length && (
              <div className="finder-empty">
                {loading
                  ? "Reading project files…"
                  : "No files match this search."}
              </div>
            )}
            {foundFiles.map((f) => {
              const Icon =
                f.kind === "Audio"
                  ? FileAudio
                  : f.kind === "Artwork"
                    ? Image
                    : f.kind === "Video"
                      ? Film
                      : FileText;
              return (
                <button
                  key={f.id}
                  aria-pressed={selected === f.id}
                  onClick={() => setSelected(f.id)}
                >
                  <Icon size={21} />
                  <div>
                    <strong>{f.name}</strong>
                    <span>
                      {f.kind} · {f.extension.toUpperCase()} · {bytes(f.size)}
                    </span>
                  </div>
                  <time>
                    {new Date(f.createdAt * 1000).toLocaleDateString()}
                  </time>
                </button>
              );
            })}
          </div>
          <aside className="file-preview">
            {entry ? (
              <>
                <span className="eyebrow">
                  {entry.kind} / {entry.extension.toUpperCase()}
                </span>
                {entry.assetId &&
                ["Audio", "Artwork", "Video"].includes(entry.kind) ? (
                  <input
                    key={entry.id + entry.name}
                    className="file-name"
                    aria-label="File name"
                    defaultValue={entry.name}
                    maxLength={180}
                    onBlur={(e) => void rename(e.target.value).catch(report)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                ) : (
                  <h3>{entry.name}</h3>
                )}
                {entry.kind === "Artwork" ? (
                  <img src={entry.url} alt={entry.name} />
                ) : entry.kind === "Video" ? (
                  <video
                    key={entry.id}
                    src={entry.url}
                    controls
                    preload="metadata"
                  />
                ) : entry.kind === "Audio" ? (
                  entry.assetId &&
                  s.assets.some((a) => a.id === entry.assetId) ? (
                    <SongPlayer
                      key={entry.id}
                      assetId={entry.assetId}
                      name={entry.name}
                      duration={
                        s.assets.find((a) => a.id === entry.assetId)!.duration
                      }
                    />
                  ) : (
                    <audio
                      key={entry.id}
                      src={entry.url}
                      controls
                      preload="metadata"
                    />
                  )
                ) : preview ? (
                  <pre>{preview}</pre>
                ) : (
                  <div className="file-format">
                    {entry.extension.toUpperCase()}
                  </div>
                )}
                <dl>
                  <dt>Size</dt>
                  <dd>{bytes(entry.size)}</dd>
                  <dt>Created</dt>
                  <dd>{new Date(entry.createdAt * 1000).toLocaleString()}</dd>
                  {entry.sourceName && (
                    <>
                      <dt>Source</dt>
                      <dd>{entry.sourceName}</dd>
                    </>
                  )}
                  <dt>Location</dt>
                  <dd>{entry.location}</dd>
                </dl>
                <a
                  className="button primary"
                  href={entry.url}
                  download={`${entry.name}.${entry.extension}`}
                >
                  <Download size={14} />
                  Download {entry.extension.toUpperCase()}
                </a>
                {entry.kind === "Audio" && entry.assetId && (
                  <button
                    onClick={() => {
                      const asset = s.assets.find(
                        (a) => a.id === entry.assetId,
                      );
                      if (asset) {
                        placeAsset(asset);
                        navigate("arrange");
                      }
                    }}
                  >
                    Add to arrangement <ArrowUpRight size={14} />
                  </button>
                )}
                {["Video", "Artwork", "Timing"].includes(entry.kind) && (
                  <button
                    onClick={() =>
                      navigate(
                        "visuals",
                        entry.kind === "Timing" ? "timing" : "assets",
                      )
                    }
                  >
                    Open in Visuals <ArrowUpRight size={14} />
                  </button>
                )}
              </>
            ) : (
              <div className="finder-empty">
                <FolderOpen size={30} />
                <p>Choose a file to preview, rename or download.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </dialog>
  );
}
