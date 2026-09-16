import { useEffect, useState } from "react";
import { useStudio, report, setState, getState } from "./store";
import { post } from "./api";
import type { Job } from "./model";
export const terminal = (j: Job) =>
  ["Complete", "Failed", "Cancelled"].includes(j.state);
export const jobKind = (kind: string) =>
  ({
    generate: "Song takes",
    plan: "Score plan",
    lyrics: "Song assistant",
    artwork: "Artwork",
    align: "Lyric alignment",
    video: "Video render",
    "music-video": "Automatic music video",
    cover: "Cover design",
    master: "Mastered audio",
    separate: "Stem separation",
    tokenize: "Audio encoding",
    export: "Export",
    backup: "Project backup",
    "model-download": "Model download",
  })[kind] ?? kind;
export const jobName = (j: Job) =>
  (j.agent ? `${j.name ?? jobKind(j.kind)} · ${j.agent.name}` : j.name) ??
  (j.projectName ?? getState().project?.name ?? "Project") +
    " · " +
    jobKind(j.kind);
export const lane = (j: Job) =>
  ["cover", "video", "master", "export", "backup"].includes(j.kind)
    ? "Render"
    : "music-video" === j.kind
      ? "Automatic"
      : "GPU";
export const elapsed = (seconds: number) =>
  seconds < 60
    ? Math.floor(seconds) + "s"
    : Math.floor(seconds / 60) + "m " + Math.floor(seconds % 60) + "s";
export function useNow() {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function JobProgress({ job: j, now }: { job: Job; now: number }) {
  const done = terminal(j),
    count = j.completed?.length ?? 0,
    total = j.request?.candidates ?? 1;
  const numerical =
    typeof j.progress === "number" && Number.isFinite(j.progress);
  const value = numerical ? Math.min(1, Math.max(0, j.progress!)) : undefined;
  const seconds = Math.max(
    0,
    (j.finishedAt ?? (done ? j.updatedAt : now)) -
      (j.startedAt ?? j.createdAt ?? now),
  );
  return (
    <div className="job-progress">
      <div className="job-progress-caption">
        <span>
          {j.state}
          {j.progressLabel && j.progressLabel !== j.state
            ? " · " + j.progressLabel
            : ""}
        </span>
        <span>
          {numerical
            ? Math.round(value! * 100) + "%"
            : j.unit && typeof j.unitsDone === "number"
              ? j.unitsDone.toLocaleString() + " " + j.unit
              : ""}
        </span>
      </div>
      {!done && (
        <progress aria-label={jobName(j) + " progress"} value={value} max={1} />
      )}
      <div className="job-progress-detail">
        <span>
          {j.kind === "generate" || j.kind === "plan"
            ? count +
              " / " +
              total +
              " " +
              (j.kind === "plan" ? "scores" : "takes") +
              " saved" +
              (!done && typeof j.candidateIndex === "number"
                ? " · working on " + (j.candidateIndex + 1)
                : "")
            : j.unitsTotal
              ? (j.unitsDone ?? 0) +
                " / " +
                j.unitsTotal +
                " " +
                (j.unit ?? "completed")
              : j.message}
        </span>
        <time>
          {j.state === "Queued" ? "Waiting " : ""}
          {elapsed(seconds)}
        </time>
      </div>
      {(j.kind === "generate" || j.kind === "plan") && (
        <div
          className="take-progress"
          aria-label={count + " of " + total + " takes saved"}
        >
          {Array.from({ length: total }, (_, i) => (
            <i
              key={i}
              className={
                j.completed?.includes(i)
                  ? "saved"
                  : i === j.candidateIndex && !done
                    ? "working"
                    : ""
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
export function JobActions({ job: j }: { job: Job }) {
  const [busy, setBusy] = useState(false);
  const action = async () => {
    setBusy(true);
    try {
      const updated = await post<Job>(
        "/jobs/" + j.id + "/" + (terminal(j) ? "retry" : "cancel"),
      );
      setState({
        jobs: [updated, ...getState().jobs.filter((x) => x.id !== updated.id)],
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button disabled={busy} onClick={() => void action().catch(report)}>
      {busy
        ? "Updating…"
        : terminal(j)
          ? j.state === "Complete"
            ? "Run again"
            : "Retry"
          : "Cancel"}
    </button>
  );
}
export function ModelDownloads({ job }: { job: Job }) {
  if (!job.download?.length) return null;
  const size = (n: number) =>
    n >= 1024 ** 3
      ? (n / 1024 ** 3).toFixed(2) + " GB"
      : n >= 1024 ** 2
        ? (n / 1024 ** 2).toFixed(1) + " MB"
        : Math.round(n / 1024) + " KB";
  return (
    <details
      className="model-downloads"
      open={job.state === "Downloading models"}
    >
      <summary>
        Model files · {job.download.filter((f) => f.state === "Ready").length} /{" "}
        {job.download.length} ready
      </summary>
      <div>
        {job.download.map((f) => (
          <div key={f.model + f.name}>
            <strong>{f.name}</strong>
            <span>{f.model}</span>
            <progress
              aria-label={f.name + " download"}
              max={f.total ?? 1}
              value={f.total ? Math.min(f.total, f.completed) : undefined}
            />
            <small>
              {f.state} · {size(f.completed)}
              {f.total ? " / " + size(f.total) : ""}
            </small>
          </div>
        ))}
      </div>
    </details>
  );
}
export function Jobs({ kinds }: { kinds?: string[] }) {
  const s = useStudio(),
    now = useNow();
  const childIds = new Set(
    s.jobs.flatMap((j) => Object.values(j.children ?? {})),
  );
  const jobs = s.jobs
    .filter(
      (j) =>
        j.projectId === s.project?.id &&
        !childIds.has(j.id) &&
        (!kinds || kinds.includes(j.kind)) &&
        j.state !== "Complete",
    )
    .slice(0, 4);
  if (!jobs.length) return null;
  return (
    <div className="jobs-strip" aria-live="polite">
      {jobs.map((j) => (
        <div
          className={"job-row " + (j.state === "Failed" ? "failed" : "")}
          key={j.id}
        >
          <div>
            <strong>{jobName(j)}</strong>
            <JobProgress job={j} now={now} />
            <ModelDownloads job={j} />
          </div>
          <JobActions job={j} />
        </div>
      ))}
    </div>
  );
}
