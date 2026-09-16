import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderOpen, Plus, Search, X } from "lucide-react";
import { api } from "./api";
import { Dialog } from "./Dialog";
import { NewMusicProject } from "./MusicLibrary";
import { engine } from "./audio";
import { getState, openProject, useStudio } from "./store";

type Summary = {
  id: string;
  name: string;
  updatedAt: number;
  archived: boolean;
  candidateCount: number;
  coverId: string | null;
  tags: string[];
};
function ProjectSwitcher({
  close,
  create,
}: {
  close: () => void;
  create: () => void;
}) {
  const s = useStudio();
  const [projects, setProjects] = useState<Summary[]>([]),
    [query, setQuery] = useState(""),
    [archive, setArchive] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState<string | null>(null);
  const opening = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api<Summary[]>("/projects", { signal: controller.signal })
      .then(setProjects)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  const matches = projects.filter(
    (p) =>
      (archive || !p.archived || p.id === s.project?.id) &&
      [p.name, ...p.tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const open = async (id: string) => {
    if (opening.current) return;
    if (id === getState().project?.id) {
      close();
      return;
    }
    opening.current = true;
    setBusy(id);
    setError("");
    try {
      engine.stop();
      await openProject(id);
      if (getState().project?.id === id) close();
      else
        setError(
          "The project could not be opened. Your current project is still here. Check the save or connection message and try again.",
        );
    } finally {
      opening.current = false;
      setBusy(null);
    }
  };
  return (
    <Dialog
      titleId="switch-project-title"
      className="project-switcher"
      onClose={() => {
        if (!opening.current) close();
      }}
    >
      <div className="modal-title">
        <div>
          <span className="eyebrow">YOUR WORK</span>
          <h2 id="switch-project-title">Switch project</h2>
        </div>
        <button
          aria-label="Close project switcher"
          disabled={!!busy}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <form
        className="project-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches[0]) void open(matches[0].id);
        }}
      >
        <Search size={17} />
        <input
          aria-label="Search projects"
          placeholder="Find a project by name or tag"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      <div className="project-switcher-tools">
        <span>
          {loading ? "Loading projects…" : matches.length + " projects"}
        </span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={archive}
            onChange={(e) => setArchive(e.target.checked)}
          />
          Include archived
        </label>
        <button disabled={!!busy} onClick={create}>
          <Plus size={15} />
          New project
        </button>
      </div>
      {error && (
        <div className="project-switcher-error" role="alert">
          <p>{error}</p>
          <button disabled={!!busy} onClick={() => setRetry(retry + 1)}>
            Retry
          </button>
        </div>
      )}
      <div className="project-switcher-list" aria-label="Projects">
        {matches.map((project) => (
          <button
            key={project.id}
            className={project.id === s.project?.id ? "current" : ""}
            disabled={!!busy}
            onClick={() => void open(project.id)}
            aria-label={"Open project " + project.name}
          >
            {project.coverId ? (
              <img
                src={
                  "/api/projects/" + project.id + "/visuals/" + project.coverId
                }
                alt=""
                loading="lazy"
              />
            ) : (
              <span className="project-placeholder">
                <FolderOpen size={21} />
              </span>
            )}
            <span className="project-switcher-copy">
              <strong>
                {project.id === s.project?.id ? s.project.name : project.name}
              </strong>
              <small>
                {project.archived ? "Archived · " : ""}
                {project.candidateCount} takes ·{" "}
                {new Date(project.updatedAt * 1000).toLocaleDateString()}
              </small>
            </span>
            {busy === project.id ? (
              <small>Opening…</small>
            ) : project.id === s.project?.id ? (
              <span className="project-current">
                <Check size={14} />
                Current
              </span>
            ) : (
              <ChevronDown className="project-open-icon" size={16} />
            )}
          </button>
        ))}
        {!loading && !error && !matches.length && (
          <p className="project-empty">
            {query
              ? "No projects match. Try another name or include archived projects."
              : "Start a new project to make your first song."}
          </p>
        )}
      </div>
      <p className="help">
        Current edits are saved before switching. Each project keeps its takes,
        assets and Studio arrangement.
      </p>
    </Dialog>
  );
}
export function ProjectNavigation() {
  const [dialog, setDialog] = useState<"switch" | "new" | null>(null);
  return (
    <div className="project-navigation">
      <button
        aria-label="New project"
        title="Start a new project"
        onClick={() => setDialog("new")}
      >
        <Plus size={15} />
        <span>New</span>
      </button>
      <button
        aria-label="Switch project"
        aria-haspopup="dialog"
        aria-expanded={dialog === "switch"}
        onClick={() => setDialog("switch")}
      >
        <FolderOpen size={15} />
        <span>Projects</span>
        <ChevronDown size={12} />
      </button>
      {dialog === "switch" && (
        <ProjectSwitcher
          close={() => setDialog(null)}
          create={() => setDialog("new")}
        />
      )}
      {dialog === "new" && <NewMusicProject close={() => setDialog(null)} />}
    </div>
  );
}
