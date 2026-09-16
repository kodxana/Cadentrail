import { IntegrationsButton } from "./IntegrationsButton";
import { AgentsButton } from "./AgentsButton";
import { PersonalizationButton } from "./Personalization";
import { HelpButton } from "./Help";
import {
  ExperienceAtmosphere,
  ExperienceSwitch,
  ExperienceWordmark,
} from "./ExperienceChrome";
import { useEffect, useRef, useState } from "react";
import {
  Library,
  ListMusic,
  AlignLeft,
  Maximize,
  Minimize,
  Search,
  X,
  Heart,
  Music2,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { libraryPlayer, useLibraryPlayer } from "./libraryPlayer";
import {
  useMusicLibrary,
  loadMusicLibrary,
  openTrackStudio,
} from "./libraryData";
import {
  Cover,
  FavoriteSong,
  PlaybackTransport,
  PlaybackVolume,
  ListeningQueue,
} from "./PlaybackControls";
import { LyricsView } from "./LyricsView";
import { durationLabel } from "./libraryModel";

export function ListeningRoom({ close }: { close: () => void }) {
  const playback = useLibraryPlayer(),
    track = playback.queue[playback.index];
  const catalogue = useMusicLibrary();
  const [songPanel, setSongPanel] = useState<"lyrics" | "artwork">("artwork");
  const [panel, setPanel] = useState<
    "lyrics" | "library" | "queue" | "artwork"
  >(track ? songPanel : "library");
  const [search, setSearch] = useState(""),
    [favorites, setFavorites] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLElement>(null),
    modeTrigger = useRef<HTMLElement | null>(null);
  const fail = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  useEffect(() => {
    modeTrigger.current = document.activeElement as HTMLElement;
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".app > :not(.music-dock):not(dialog)",
      ),
    ).map((el) => ({ el, inert: el.inert }));
    background.forEach(({ el }) => {
      el.inert = true;
    });
    root.current?.focus({ preventScroll: true });
    const update = () =>
      setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", update);
    void loadMusicLibrary().catch(fail);
    const element = root.current;
    return () => {
      background.forEach(({ el, inert }) => {
        el.inert = inert;
      });
      document.removeEventListener("fullscreenchange", update);
      if (document.fullscreenElement === element)
        void document.exitFullscreen().catch(() => {});
      if (modeTrigger.current?.isConnected)
        modeTrigger.current.focus({ preventScroll: true });
    };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === root.current)
        await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch (e) {
      fail(e);
    }
  };
  const songs = catalogue.tracks.filter(
    (t) =>
      !t.archived &&
      t.kind !== "stem" &&
      (!favorites || t.favorite) &&
      `${t.title} ${t.artist} ${t.version}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <section
      ref={root}
      className={"listening-room panel-" + panel + (!track ? " no-song" : "")}
      aria-label="Listening mode"
      tabIndex={-1}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          if (document.fullscreenElement) void document.exitFullscreen();
          else if (panel === "library" || panel === "queue")
            setPanel(track ? songPanel : "artwork");
          else close();
        }
        if (
          e.code === "Space" &&
          !(e.target as HTMLElement).closest("button,a,input,summary")
        ) {
          e.preventDefault();
          libraryPlayer.toggle();
        }
        if (e.key === "Tab") {
          const items = Array.from(
            root.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),a[href],input:not(:disabled),summary,[tabindex="0"]',
            ) ?? [],
          ).filter((el) => el.getClientRects().length);
          const first = items[0],
            last = items.at(-1);
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === root.current)
          ) {
            e.preventDefault();
            last?.focus();
          } else if (
            !e.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === root.current)
          ) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <ExperienceAtmosphere coverUrl={track?.coverUrl} />
      <header className="listening-room-header">
        <ExperienceWordmark room="THE LISTENING ROOM" />
        <ExperienceSwitch listening onCreate={close} />
        <div className="listening-utilities"><AgentsButton/><IntegrationsButton/><HelpButton context="listen" /><PersonalizationButton />
        <button
          className="listen-library-toggle"
          aria-label="Browse listening library"
          aria-pressed={panel === "library"}
          onClick={() =>
            setPanel(
              panel === "library" ? (track ? songPanel : "artwork") : "library",
            )
          }
        >
          <Library size={17} />
          <span>Library</span>
        </button>
        </div>
      </header>
      <main className="listening-room-body">
        <section className="listening-record" aria-label="Now playing">
          <div className="listening-artwork">
            {track?.coverUrl ? (
              <img src={track.coverUrl} alt={track.title + " artwork"} />
            ) : (
              <div className="listening-artwork-empty">
                <Music2 size={76} />
                <span>{track ? track.title : "A little space for music."}</span>
              </div>
            )}
          </div>
          <div className="listening-record-title">
            <div>
              <h1>{track?.title ?? "Your music. Nothing else."}</h1>
              <p>
                {track?.artist ||
                  (track
                    ? "Artist not set"
                    : "Choose a song from your Library")}
              </p>
            </div>
            {track && <FavoriteSong track={track} onError={fail} />}
          </div>
          {track && (
            <span className="listening-record-version" title={track.version}>
              {track.version}
            </span>
          )}
          <PlaybackTransport />
          <PlaybackVolume />
          <div className="listening-record-tools">
            <button
              disabled={!track}
              className="listening-lyrics-toggle"
              aria-label={panel === "lyrics" ? "Hide lyrics" : "Show lyrics"}
              aria-pressed={panel === "lyrics"}
              onClick={() => {
                const next = panel === "lyrics" ? "artwork" : "lyrics";
                setSongPanel(next);
                setPanel(next);
              }}
            >
              <AlignLeft size={18} />
              <span>{panel === "lyrics" ? "Hide lyrics" : "Show lyrics"}</span>
            </button>
            <button
              aria-label="Show listening queue"
              aria-pressed={panel === "queue"}
              onClick={() =>
                setPanel(
                  panel === "queue" ? (track ? songPanel : "artwork") : "queue",
                )
              }
            >
              <ListMusic size={18} />
            </button>
            {track && (
              <details className="listening-song-details">
                <summary aria-label="Song options">···</summary>
                <div>
                  <strong>{track.title}</strong>
                  <span>{track.version}</span>
                  <button
                    onClick={() =>
                      void openTrackStudio(track).then(close).catch(fail)
                    }
                  >
                    <ArrowUpRight size={15} />
                    Open song in Studio
                  </button>
                  <a href={track.url} download>
                    Download original audio
                  </a>
                </div>
              </details>
            )}
          </div>
        </section>
        {panel !== "artwork" && (
          <section
            className="listening-room-panel"
            aria-label={
              panel === "library"
                ? "Listening Library"
                : panel === "queue"
                  ? "Queue panel"
                  : "Lyrics panel"
            }
          >
            {panel === "lyrics" && track && (
              <LyricsView key={track.id} track={track} close={close} />
            )}
            {panel === "queue" && (
              <ListeningQueue
                close={() => setPanel(track ? songPanel : "artwork")}
              />
            )}
            {panel === "library" && (
              <div className="listening-library">
                <header>
                  <div>
                    <span className="eyebrow">YOUR COLLECTION</span>
                    <h2>Find your next listen.</h2>
                  </div>
                  <button
                    aria-label="Close listening library"
                    onClick={() => setPanel(track ? songPanel : "artwork")}
                  >
                    <X size={19} />
                  </button>
                </header>
                <div className="listening-search">
                  <Search size={17} />
                  <input
                    aria-label="Search listening library"
                    placeholder="Songs, artists, versions"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      aria-label="Clear song search"
                      onClick={() => setSearch("")}
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    aria-label="Only favorites"
                    aria-pressed={favorites}
                    onClick={() => setFavorites(!favorites)}
                  >
                    <Heart
                      size={17}
                      fill={favorites ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                {(catalogue.error || error) && (
                  <p role="alert" className="listen-inline-error">
                    {catalogue.error || error}
                    <button onClick={() => void loadMusicLibrary().catch(fail)}>
                      Retry
                    </button>
                  </p>
                )}
                <div className="listening-library-list">
                  <ol>
                    {songs.map((song, index) => (
                      <li
                        key={song.id}
                        className={song.id === track?.id ? "current" : ""}
                      >
                        <button
                          className="listen-song"
                          aria-label={`Listen to ${song.title}, ${song.version}`}
                          onClick={() => {
                            libraryPlayer.playQueue(songs, index);
                            setPanel(songPanel);
                          }}
                        >
                          <Cover
                            url={song.coverUrl}
                            title={song.title}
                            size={48}
                          />
                          <span>
                            <strong>{song.title}</strong>
                            <small>
                              {song.artist || "Artist not set"} · {song.version}
                            </small>
                          </span>
                          <span>{durationLabel(song.duration)}</span>
                        </button>
                        <button
                          aria-label={`Queue ${song.version}`}
                          title="Add to queue"
                          onClick={() => libraryPlayer.enqueue(song)}
                        >
                          <Plus size={16} />
                        </button>
                      </li>
                    ))}
                  </ol>
                  {!songs.length && (
                    <div className="listening-library-empty">
                      <Music2 size={30} />
                      <h3>
                        {catalogue.loaded
                          ? "No songs here yet"
                          : "Loading your music…"}
                      </h3>
                      <p>
                        {search || favorites
                          ? "Try another search or turn off the favorites filter."
                          : "Songs you generate or import appear here automatically."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      <footer className="listening-room-footer">
        <span>{track ? "FROM YOUR LIBRARY" : "A DAW FOR YUE2"}</span>
        <div>
          {error && panel !== "library" && (
            <span role="alert">
              {error}
              <button
                aria-label="Dismiss player error"
                onClick={() => setError(null)}
              >
                <X size={14} />
              </button>
            </span>
          )}
          <button
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </footer>
    </section>
  );
}
