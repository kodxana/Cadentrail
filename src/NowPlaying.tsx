const RadioRoom = lazy(() =>
  import("./RadioRoom").then((m) => ({ default: m.RadioRoom })),
);
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Headphones, ListMusic, ArrowUpRight } from "lucide-react";
import { ListeningRoom } from "./ListeningRoom";
import {
  Cover,
  PlaybackTransport,
  PlaybackVolume,
  ListeningQueue,
  FavoriteSong,
} from "./PlaybackControls";
export { Cover } from "./PlaybackControls";
import { libraryPlayer, useLibraryPlayer } from "./libraryPlayer";
import { openTrackStudio } from "./libraryData";
import { report, useStudio, setState } from "./store";
import { engine } from "./audio";
export function NowPlaying({ canListen = true }: { canListen?: boolean }) {
  const s = useLibraryPlayer(),
    track = s.queue[s.index],
    { listening, radio } = useStudio();
  const [queueOpen, setQueueOpen] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  useEffect(
    () => (host.current ? libraryPlayer.mount(host.current) : undefined),
    [],
  );
  const listen = () => {
    engine.pause();
    setQueueOpen(false);
    setState({ listening: true });
  };
  return (
    <section
      className={"music-dock" + (listening || radio ? " is-listening" : "")}
      aria-label="Music player"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span ref={host} className="player-audio-host" />
      {radio ? (
        <Suspense
          fallback={
            <div className="radio-loading" role="status">
              Opening Radio…
            </div>
          }
        >
          <RadioRoom />
        </Suspense>
      ) : listening ? (
        <ListeningRoom close={() => setState({ listening: false })} />
      ) : (
        <>
          {queueOpen && <ListeningQueue close={() => setQueueOpen(false)} />}
          <div className="playing-identity">
            <button
              className="dock-cover-button"
              aria-label="Open listening mode"
              disabled={!canListen}
              onClick={listen}
            >
              <Cover
                url={track?.coverUrl ?? null}
                title={track?.title ?? "Music"}
                size={54}
              />
            </button>
            <div>
              <strong title={track?.title}>
                {track?.title ?? "Your music, ready to play"}
              </strong>
              <span title={track?.version}>
                {track
                  ? `${track.artist || "Artist not set"} · ${track.version}`
                  : "Choose a song from your Library"}
              </span>
            </div>
            {track && <FavoriteSong track={track} onError={report} />}
          </div>
          <PlaybackTransport />
          <div className="listening-options">
            <button
              aria-label="Listen mode"
              disabled={!canListen}
              title={
                canListen
                  ? "Listen · immersive player and lyrics"
                  : "Finish recording before entering Listen"
              }
              onClick={listen}
            >
              <Headphones size={19} />
            </button>
            <button
              aria-label="Listening queue"
              aria-expanded={queueOpen}
              className={queueOpen ? "enabled" : ""}
              onClick={() => setQueueOpen(!queueOpen)}
            >
              <ListMusic size={19} />
            </button>
            <button
              disabled={!track}
              aria-label="Open playing song in Studio"
              onClick={() => track && void openTrackStudio(track).catch(report)}
            >
              <ArrowUpRight size={18} />
            </button>
            <PlaybackVolume />
          </div>
        </>
      )}
    </section>
  );
}
