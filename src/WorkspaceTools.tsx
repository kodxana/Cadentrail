import { useEffect, useState } from "react";
import { X, Archive, Cpu, Download, Upload, CheckCircle2 } from "lucide-react";
import { Dialog } from "./Dialog";
import { api, post, fileApi } from "./api";
import { useStudio, getState, save, setState, report, notice } from "./store";
import { loadMusicLibrary } from "./libraryData";
import type { Job } from "./model";
import { JobProgress, ModelDownloads, JobActions, useNow } from "./Jobs";
type Model = {
  id: string;
  name: string;
  bytes: number;
  missingBytes: number;
  ready: boolean;
  core: boolean;
  bundled: boolean;
};
const size = (bytes: number) =>
  bytes >= 1024 ** 3
    ? (bytes / 1024 ** 3).toFixed(2) + " GiB"
    : bytes >= 1024 ** 2
      ? (bytes / 1024 ** 2).toFixed(1) + " MiB"
      : Math.ceil(bytes / 1024) + " KiB";
export function WorkspaceTools({ close }: { close: () => void }) {
  const s = useStudio();
  const now = useNow();
  const [error, setError] = useState("");
  const fail = (e: unknown) => {
    if (e instanceof Error && e.name === "DownloadCancelled") return;
    setError(e instanceof Error ? e.message : String(e));
  };
  const [tab, setTab] = useState("backups"),
    [models, setModels] = useState<Model[]>([]),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState<string[]>(
      s.project ? [s.project.id] : [],
    ),
    [last, setLast] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<string | null>(null),
    [restoreType, setRestoreType] = useState("bundle");
  const refresh = async () => {
    const [inventory, list, backups] = await Promise.all([
      api<{ models: Model[] }>("/models"),
      api<typeof projects>("/projects"),
      api<{ last: any }>("/backups"),
    ]);
    setModels(inventory.models);
    setProjects(list);
    setLast(backups.last);
  };
  const jobSignature = s.jobs
    .filter((j) => ["backup", "model-download"].includes(j.kind))
    .map((j) => j.id + j.state)
    .join();
  useEffect(() => {
    void refresh().catch(fail);
  }, [jobSignature]);
  const enqueue = async (
    kind: string,
    options: Record<string, unknown>,
    projectId = s.project?.id,
  ) => {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      await save();
      if (getState().dirty)
        throw new Error("Save or resolve your current edits first.");
      const job = await post<Job>("/jobs", { projectId, kind, options });
      setState({ jobs: [job, ...getState().jobs] });
      notice("Queued. You can keep working while this finishes.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      titleId="workspace-tools-title"
      className="workspace-tools"
      onClose={close}
    >
      <div className="modal-title">
        <h2 id="workspace-tools-title">Workstation tools</h2>
        <button aria-label="Close workstation tools" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <nav
        className="workspace-tools-tabs"
        aria-label="Workstation tools pages"
      >
        <button
          className={tab === "backups" ? "active" : ""}
          aria-pressed={tab === "backups"}
          onClick={() => setTab("backups")}
        >
          <Archive size={16} />
          Backups
        </button>
        <button
          className={tab === "models" ? "active" : ""}
          aria-pressed={tab === "models"}
          onClick={() => setTab("models")}
        >
          <Cpu size={16} />
          Models
        </button>
      </nav>
      {tab === "models" ? (
        <>
          <p>
            Included models stay with the image. Choose additional tools here.
            You will see the download size before confirming.
          </p>
          {!s.project && <p>Open a project to prepare an optional model.</p>}
          <div className="model-list">
            {models.map((m) => (
              <section key={m.id}>
                <div>
                  <strong>{m.name}</strong>
                  <small>
                    {m.bundled
                      ? "Included · "
                      : m.core
                        ? "Required · "
                        : "Optional · "}
                    {m.ready
                      ? "Installed"
                      : m.missingBytes < m.bytes
                        ? "Partial download"
                        : "Not installed"}{" "}
                    · {size(m.bytes)}
                  </small>
                  {m.bundled && !m.ready && (
                    <small>
                      Image incomplete. Pull the complete image again.
                    </small>
                  )}
                  {m.id === "realaudio-v4" && (
                    <small>
                      Recording encoding also needs MERT, downloaded with your
                      approval.
                    </small>
                  )}
                  {m.id === "sortformer" && (
                    <small>
                      Voice detection supports the separate lyric alignment
                      models.
                    </small>
                  )}
                </div>
                {!m.core && !m.bundled && (
                  <div className="model-actions">
                    {!m.ready && (
                      <button
                        disabled={busy || !s.project}
                        onClick={() =>
                          void enqueue("model-download", { modelId: m.id })
                        }
                      >
                        {m.missingBytes < m.bytes
                          ? "Resume download"
                          : "Download"}
                      </button>
                    )}
                    {m.missingBytes < m.bytes &&
                      (remove === m.id ? (
                        <>
                          <span>Remove this model cache?</span>
                          <button
                            disabled={busy}
                            onClick={() => {
                              setBusy(true);
                              void api("/models/" + m.id, { method: "DELETE" })
                                .then(() => {
                                  setRemove(null);
                                  return refresh();
                                })
                                .catch(fail)
                                .finally(() => setBusy(false));
                            }}
                          >
                            Confirm removal
                          </button>
                          <button onClick={() => setRemove(null)}>Keep</button>
                        </>
                      ) : (
                        <button disabled={busy} onClick={() => setRemove(m.id)}>
                          Remove
                        </button>
                      ))}
                  </div>
                )}
              </section>
            ))}
          </div>
          <p className="help">
            Removal waits until jobs and Radio are stopped. For a damaged
            optional model, remove its cache and download it again.
          </p>
        </>
      ) : (
        <>
          <p>
            Prepare a verified project backup, then download it off this Pod. A
            server copy alone does not protect against Pod deletion.
          </p>
          <label>
            <input
              type="checkbox"
              checked={
                projects.length > 0 && selected.length === projects.length
              }
              onChange={(e) =>
                setSelected(e.target.checked ? projects.map((p) => p.id) : [])
              }
            />{" "}
            All projects
          </label>
          <div className="backup-projects">
            {projects.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, p.id]
                        : selected.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
          <button
            className="primary"
            disabled={busy || !selected.length}
            onClick={() =>
              void enqueue("backup", { projectIds: selected }, selected[0])
            }
          >
            <Archive size={16} />
            Prepare selected backup
          </button>
          {last && (
            <div className="backup-status">
              <strong>
                <CheckCircle2 size={16} />
                Last verified server copy
              </strong>
              <span>
                {new Date(last.createdAt * 1000).toLocaleString()} ·{" "}
                {last.projects.length} projects · {size(last.bytes)}
              </span>
              <a
                className="button"
                href={"/api/exports/" + last.filename}
                download
              >
                <Download size={16} />
                Download verified backup
              </a>
              <details>
                <summary>SHA-256 checksum</summary>
                <code>{last.sha256}</code>
              </details>
            </div>
          )}
          <hr />
          <h3>
            <Upload size={17} />
            Restore as new projects
          </h3>
          <p>
            Restoring leaves your existing projects intact. Backup bundles and
            older portable project ZIPs are supported.
          </p>
          <select
            aria-label="Restore archive type"
            value={restoreType}
            onChange={(e) => setRestoreType(e.target.value)}
          >
            <option value="bundle">Backup bundle</option>
            <option value="project">Portable project ZIP</option>
          </select>
          <input
            aria-label="Restore backup file"
            type="file"
            accept=".zip"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              void (async () => {
                await save();
                if (getState().dirty)
                  throw new Error("Resolve unsaved edits before restoring.");
                await fileApi(
                  restoreType === "bundle"
                    ? "/backups/import"
                    : "/projects/import-portable",
                  f,
                );
                await refresh();
                await loadMusicLibrary();
                notice(
                  "Backup restored as new projects. Open them from Library.",
                );
              })()
                .catch(fail)
                .finally(() => setBusy(false));
            }}
          />
          <p className="help">
            Portable backups contain projects and media, including original
            generations, scores, timing and visuals. Full database revision
            history and model caches are separate.
          </p>
        </>
      )}
      {s.jobs
        .filter((j) => ["backup", "model-download"].includes(j.kind))
        .slice(0, 5)
        .map((j) => (
          <div className="maintenance-job" key={j.id}>
            <strong>{j.name}</strong>
            <JobProgress job={j} now={now} />
            <ModelDownloads job={j} />
            {j.state !== "Complete" && <JobActions job={j} />}
          </div>
        ))}
      {error && (
        <p role="alert" className="workspace-tool-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Preparing…</p>}
    </Dialog>
  );
}
