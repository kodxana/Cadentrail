import { useEffect, useRef, useState } from "react";
import {
  Music2,
  Heart,
  FolderOpen,
  Archive,
  Search,
  Plus,
  Play,
  Pause,
  ListPlus,
  ArrowUpRight,
  Copy,
  RotateCcw,
  X,
  ArrowLeft,
  Headphones,
  Clock3,
} from "lucide-react";
import {
  useMusicLibrary,
  loadMusicLibrary,
  favoriteTrack,
  updateLibraryProject,
  duplicateLibraryProject,
} from "./libraryData";
import { libraryPlayer, useLibraryPlayer } from "./libraryPlayer";
import {
  type LibraryProject,
  type LibraryTrack,
  durationLabel,
  trackKind,
} from "./libraryModel";
import { Cover } from "./NowPlaying";
import {
  createProject,
  openProject,
  getState,
  setState,
  report,
  notice,
  useStudio,
} from "./store";
import { startSketch } from "./projectStarters";
import { engine } from "./audio";
import { BrandCredits } from "./Brand";
import { TrackMenu } from "./TrackMenu";

type Shelf = "songs" | "projects" | "favorites" | "audio" | "archive";
const categories = [
  ["songs", "Songs", Music2],
  ["projects", "Projects", FolderOpen],
  ["favorites", "Favorites", Heart],
  ["audio", "All audio", Headphones],
  ["archive", "Archive", Archive],
] as const;
export function NewMusicProject({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("Untitled song"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    d?.querySelector("input")?.focus();
    return () => d?.close();
  }, []);
  const finish = () => {
    dialog.current?.close();
    close();
  };
  const create = async (sketch = false) => {
    setBusy(true);
    const before = getState().project?.id;
    try {
      engine.stop();
      if (sketch) await startSketch(name.trim() || "Composition sketch");
      else await createProject(name.trim() || "Untitled song");
      if (getState().project?.id !== before) {
        setState({ view: sketch ? "arrange" : "create" });
        close();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="new-music-dialog"
      aria-labelledby="new-music-title"
      onCancel={(event) => {
        event.preventDefault();
        finish();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header>
        <h2 id="new-music-title">Start something new</h2>
        <button aria-label="Close new project" onClick={finish}>
          <X size={18} />
        </button>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label>
          Project name
          <input
            aria-label="New project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={180}
          />
        </label>
        <div className="new-project-choices">
          <button type="submit" className="primary" disabled={busy}>
            <Music2 size={18} />
            Create song
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void create(true)}
          >
            Start a Studio sketch
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function MusicLibrary() {
  const data = useMusicLibrary(),
    player = useLibraryPlayer(),
    studio = useStudio();
  const [shelf, setShelf] = useState<Shelf>("songs"),
    [search, setSearch] = useState(""),
    [projectId, setProjectId] = useState<string | null>(null),
    [sort, setSort] = useState("recent"),
    [limit, setLimit] = useState(75),
    [newProject, setNewProject] = useState(false),
    [busy, setBusy] = useState<string | null>(null);
  const selected = data.projects.find((p) => p.id === projectId);
  useEffect(() => {
    setLimit(75);
  }, [shelf, search, projectId, sort]);
  const query = search.toLocaleLowerCase().trim();
  const matches = (values: string[]) =>
    values.join(" ").toLocaleLowerCase().includes(query);
  let tracks = data.tracks.filter(
    (t) =>
      (selected
        ? t.projectId === selected.id
        : shelf === "archive"
          ? t.archived
          : !t.archived) &&
      (shelf === "audio" || t.kind !== "stem") &&
      (shelf !== "favorites" || t.favorite) &&
      matches([t.title, t.artist, t.version, ...t.tags]),
  );
  tracks = [...tracks].sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title) || a.version.localeCompare(b.version)
      : sort === "artist"
        ? a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)
        : sort === "duration"
          ? b.duration - a.duration
          : b.updatedAt - a.updatedAt || a.title.localeCompare(b.title),
  );
  const projects = data.projects.filter(
    (p) =>
      (shelf === "archive" ? p.archived : !p.archived) &&
      (shelf !== "favorites" || p.favorite) &&
      matches([p.name, p.artist, ...p.tags]),
  );
  const cards = shelf === "projects" || (shelf === "archive" && !selected);
  const action = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };
  const open = async (p: LibraryProject) => {
    engine.stop();
    await openProject(p.id);
  };
  const play = (track: LibraryTrack) => {
    const index = tracks.findIndex((t) => t.id === track.id);
    libraryPlayer.playQueue(tracks, index);
  };
  const favorite = (track: LibraryTrack) =>
    void action(track.id, () => favoriteTrack(track));
  const projectCard = (p: LibraryProject) => (
    <article className="collection-card" key={p.id}>
      <button
        className="collection-cover"
        aria-label={"Browse " + p.name}
        onClick={() => {
          setProjectId(p.id);
          setShelf(p.archived ? "archive" : "songs");
          setSearch("");
        }}
      >
        <Cover url={p.coverUrl} title={p.name} size={180} />
        <span className="collection-browse">View songs</span>
      </button>
      <div className="collection-title">
        <button
          onClick={() => {
            setProjectId(p.id);
            setShelf(p.archived ? "archive" : "songs");
          }}
        >
          {p.name}
        </button>
        <button
          aria-label={"Favorite project " + p.name}
          className={p.favorite ? "favorite" : ""}
          disabled={busy === p.id}
          onClick={() =>
            void action(p.id, () =>
              updateLibraryProject(p.id, { favorite: !p.favorite }),
            )
          }
        >
          <Heart size={15} fill={p.favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <p>{p.artist || "Artist not set"}</p>
      <small>
        {p.songCount} {p.songCount === 1 ? "song" : "songs"} · {p.trackCount}{" "}
        tracks
      </small>
      <div className="collection-actions">
        <button onClick={() => void open(p)}>
          <ArrowUpRight size={13} />
          Open project
        </button>
        <button
          title="Duplicate project"
          aria-label={"Duplicate " + p.name}
          disabled={busy === p.id}
          onClick={() => void action(p.id, () => duplicateLibraryProject(p.id))}
        >
          <Copy size={14} />
        </button>
        <button
          title={p.archived ? "Restore from archive" : "Archive project"}
          aria-label={(p.archived ? "Restore " : "Archive ") + p.name}
          disabled={busy === p.id}
          onClick={() =>
            void action(p.id, () =>
              updateLibraryProject(p.id, { archived: !p.archived }),
            )
          }
        >
          {p.archived ? <RotateCcw size={14} /> : <Archive size={14} />}
        </button>
      </div>
    </article>
  );
  return (
    <div className="music-library">
      <aside className="collection-sidebar">
        <span className="eyebrow">YOUR COLLECTION</span>
        <nav aria-label="Library collections">
          {categories.map(([key, label, Icon]) => (
            <button
              key={key}
              aria-label={label}
              aria-current={shelf === key ? "page" : undefined}
              className={shelf === key ? "selected" : ""}
              onClick={() => {
                setShelf(key);
                setProjectId(null);
                setSearch("");
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              <small>
                {key === "projects"
                  ? data.projects.filter((p) => !p.archived).length
                  : key === "favorites"
                    ? data.tracks.filter((t) => t.favorite && !t.archived)
                        .length
                    : key === "archive"
                      ? data.projects.filter((p) => p.archived).length
                      : key === "audio"
                        ? data.tracks.filter((t) => !t.archived).length
                        : data.tracks.filter(
                            (t) => !t.archived && t.kind !== "stem",
                          ).length}
              </small>
            </button>
          ))}
        </nav>
        <div className="collection-sidebar-bottom">
          <span className="status-dot" />
          <strong>
            {studio.status.available
              ? "Workstation connected"
              : "Local library"}
          </strong>
          <span>Your projects and original media.</span>
          <BrandCredits />
        </div>
      </aside>
      <main className="collection-main">
        <header className="collection-header">
          <div>
            <span className="eyebrow">CADENTRAIL COLLECTION</span>
            <h1>
              {selected
                ? selected.name
                : shelf === "favorites"
                  ? "Your favorites"
                  : shelf === "archive"
                    ? "Archived projects"
                    : "Your Library"}
            </h1>
            <p>
              {selected
                ? selected.artist || "Artist not set"
                : `${data.tracks.filter((t) => !t.archived && t.kind !== "stem").length} songs · ${data.projects.filter((p) => !p.archived).length} projects`}
            </p>
          </div>
          <button
            className="primary"
            onClick={(event) => {
              event.currentTarget.focus();
              setNewProject(true);
            }}
          >
            <Plus size={16} />
            New project
          </button>
        </header>
        {data.error && (
          <div role="alert" className="collection-error">
            {data.error}
            <button onClick={() => void loadMusicLibrary().catch(report)}>
              Try again
            </button>
          </div>
        )}
        {selected && (
          <section className="collection-project">
            <Cover url={selected.coverUrl} title={selected.name} size={126} />
            <div>
              <button
                className="collection-back"
                onClick={() => setProjectId(null)}
              >
                <ArrowLeft size={13} />
                All {shelf === "archive" ? "archived projects" : "songs"}
              </button>
              <h2>{selected.name}</h2>
              <p>
                {selected.style || "An original project from your workstation."}
              </p>
              <span>
                {selected.songCount} songs · {selected.tempo} BPM{" "}
                {selected.archived ? "· Archived" : ""}
              </span>
              <button onClick={() => void open(selected)}>
                <ArrowUpRight size={14} />
                Open in Studio / Create
              </button>
            </div>
          </section>
        )}
        {!selected && !cards && projects.length > 0 && (
          <section className="recent-collections">
            <div className="collection-section-title">
              <h2>
                {shelf === "favorites"
                  ? "Favorite projects"
                  : "Recently worked on"}
              </h2>
              <button onClick={() => setShelf("projects")}>
                View all projects
              </button>
            </div>
            <div className="collection-shelf">
              {projects.slice(0, 6).map(projectCard)}
            </div>
          </section>
        )}
        <div className="collection-toolbar">
          <div>
            <h2>
              {cards
                ? shelf === "archive"
                  ? "Archive"
                  : "Projects"
                : shelf === "audio"
                  ? "All audio files"
                  : shelf === "favorites"
                    ? "Favorite songs"
                    : "Songs"}
            </h2>
            {!cards && (
              <button
                className="play-collection"
                disabled={!tracks.length}
                onClick={() => libraryPlayer.playQueue(tracks)}
              >
                <Play size={14} fill="currentColor" />
                Play all
              </button>
            )}
          </div>
          <div className="collection-search">
            <Search size={16} />
            <input
              aria-label="Search music library"
              placeholder="Search songs, artists or versions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                aria-label="Clear library search"
                onClick={() => setSearch("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {!cards && (
            <select
              aria-label="Sort library"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Recently updated</option>
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="duration">Duration</option>
            </select>
          )}
        </div>
        {!data.loaded && !data.error ? (
          <div className="collection-empty">
            <span className="spinner" />
            Loading your collection…
          </div>
        ) : cards ? (
          <div className="collection-grid">{projects.map(projectCard)}</div>
        ) : (
          <div className="song-table-scroll">
            <table className="song-library-table">
              <thead>
                <tr>
                  <th aria-label="Track number">#</th>
                  <th>Song</th>
                  <th>Version</th>
                  <th className="song-added">Added / updated</th>
                  <th>
                    <Clock3 size={14} />
                    <span className="sr-only">Duration</span>
                  </th>
                  <th aria-label="Song actions" />
                </tr>
              </thead>
              <tbody>
                {tracks.slice(0, limit).map((track, index) => {
                  const active = player.queue[player.index]?.id === track.id;
                  return (
                    <tr
                      key={track.id}
                      className={active ? "is-playing" : ""}
                      onDoubleClick={(event) => {
                        if (
                          !(event.target as HTMLElement).closest(
                            "button,a,input",
                          )
                        )
                          play(track);
                      }}
                    >
                      <td>
                        <button
                          className="row-play"
                          aria-label={
                            (active && player.playing ? "Pause " : "Play ") +
                            track.title +
                            ", " +
                            track.version
                          }
                          onClick={() =>
                            active ? libraryPlayer.toggle() : play(track)
                          }
                        >
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          {active && player.playing ? (
                            <Pause size={15} fill="currentColor" />
                          ) : (
                            <Play size={15} fill="currentColor" />
                          )}
                        </button>
                      </td>
                      <td>
                        <div className="library-song-title">
                          <Cover
                            url={track.coverUrl}
                            title={track.title}
                            size={42}
                          />
                          <div>
                            <button
                              title={track.title}
                              onClick={() => play(track)}
                            >
                              {track.title}
                            </button>
                            <span>{track.artist || "Artist not set"}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="song-version">
                          <strong title={track.version}>{track.version}</strong>
                          <span>{trackKind[track.kind]}</span>
                        </div>
                      </td>
                      <td className="song-added">
                        {new Date(track.updatedAt * 1000).toLocaleDateString()}
                      </td>
                      <td className="song-duration">
                        {durationLabel(track.duration)}
                      </td>
                      <td>
                        <div className="song-row-actions">
                          <button
                            className={track.favorite ? "favorite" : ""}
                            disabled={busy === track.id}
                            aria-label={
                              (track.favorite ? "Unfavorite " : "Favorite ") +
                              track.title +
                              ", " +
                              track.version
                            }
                            onClick={() => favorite(track)}
                          >
                            <Heart
                              size={16}
                              fill={track.favorite ? "currentColor" : "none"}
                            />
                          </button>
                          <button
                            aria-label={
                              "Add " + track.version + " to listening queue"
                            }
                            title="Add to queue"
                            onClick={() => {
                              libraryPlayer.enqueue(track);
                              notice("Added to your listening queue.");
                            }}
                          >
                            <ListPlus size={17} />
                          </button>
                          <TrackMenu track={track} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data.loaded && !(cards ? projects : tracks).length && (
          <div className="collection-empty">
            <Music2 size={34} />
            <h3>
              {query
                ? "Nothing matches your search"
                : shelf === "favorites"
                  ? "Keep your favorites here"
                  : cards
                    ? "No projects here yet"
                    : "Your next favorite song starts here"}
            </h3>
            <p>
              {query
                ? "Try a song title, artist, version name or tag."
                : shelf === "favorites"
                  ? "Tap a heart beside a song or a project."
                  : "Generate or import audio in a project, then listen here."}
            </p>
            {!query && shelf !== "favorites" && (
              <button
                onClick={(event) => {
                  event.currentTarget.focus();
                  setNewProject(true);
                }}
              >
                Create a project
              </button>
            )}
          </div>
        )}
        {!cards && tracks.length > limit && (
          <button
            className="collection-more"
            onClick={() => setLimit(limit + 75)}
          >
            Show more · {limit} of {tracks.length}
          </button>
        )}
      </main>
      {newProject && <NewMusicProject close={() => setNewProject(false)} />}
    </div>
  );
}
