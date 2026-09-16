import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Heart,
  X,
  ChevronUp,
  ChevronDown,
  Music2,
} from "lucide-react";
import { libraryPlayer, useLibraryPlayer } from "./libraryPlayer";
import { durationLabel, type LibraryTrack } from "./libraryModel";
import { favoriteTrack } from "./libraryData";
export function Cover({
  url,
  title,
  size = 48,
}: {
  url: string | null;
  title: string;
  size?: number;
}) {
  return (
    <span className="music-cover" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <>
          <Music2 size={Math.max(18, size / 3)} />
          <span>{title.slice(0, 1).toUpperCase()}</span>
        </>
      )}
    </span>
  );
}

export function PlaybackTransport() {
  const s = useLibraryPlayer(),
    track = s.queue[s.index];
  return (
    <div className="listening-transport">
      <div className="listening-buttons">
        <button
          disabled={!track}
          aria-label="Shuffle"
          aria-pressed={s.shuffle}
          className={s.shuffle ? "enabled" : ""}
          onClick={() => libraryPlayer.setShuffle()}
        >
          <Shuffle size={16} />
        </button>
        <button
          disabled={!track}
          aria-label="Previous song"
          onClick={() => libraryPlayer.previous()}
        >
          <SkipBack size={19} fill="currentColor" />
        </button>
        <button
          className="listening-play"
          disabled={!track}
          aria-label={
            s.playing || s.loading ? "Pause playback" : "Play playback"
          }
          onClick={() => libraryPlayer.toggle()}
        >
          {s.loading ? (
            <span className="spinner" />
          ) : s.playing ? (
            <Pause size={21} fill="currentColor" />
          ) : (
            <Play size={21} fill="currentColor" />
          )}
        </button>
        <button
          disabled={!track}
          aria-label="Next song"
          onClick={() => libraryPlayer.next()}
        >
          <SkipForward size={19} fill="currentColor" />
        </button>
        <button
          disabled={!track}
          aria-label={"Repeat: " + s.repeat}
          className={s.repeat !== "off" ? "enabled" : ""}
          onClick={() => libraryPlayer.setRepeat()}
        >
          {s.repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
        </button>
      </div>
      <div className="listening-progress">
        <span>{durationLabel(s.time)}</span>
        <input
          type="range"
          aria-label="Playback position"
          min="0"
          max={s.duration || 1}
          step=".1"
          value={s.time}
          disabled={!track}
          onChange={(e) => libraryPlayer.seek(+e.target.value)}
          style={
            {
              "--played": `${s.duration ? (s.time / s.duration) * 100 : 0}%`,
            } as React.CSSProperties
          }
        />
        <span>{durationLabel(s.duration)}</span>
      </div>
      {s.error && (
        <span className="player-error" role="alert">
          {s.error}
        </span>
      )}
    </div>
  );
}
export function PlaybackVolume() {
  const s = useLibraryPlayer();
  return (
    <div className="playback-volume">
      {" "}
      <button
        aria-label={s.muted ? "Unmute playback" : "Mute playback"}
        onClick={() => libraryPlayer.mute()}
      >
        {s.muted || s.volume === 0 ? (
          <VolumeX size={18} />
        ) : (
          <Volume2 size={18} />
        )}
      </button>
      <input
        type="range"
        aria-label="Playback volume"
        min="0"
        max="1"
        step=".01"
        value={s.muted ? 0 : s.volume}
        onChange={(e) => libraryPlayer.setVolume(+e.target.value)}
      />
    </div>
  );
}
export function ListeningQueue({ close }: { close: () => void }) {
  const s = useLibraryPlayer(),
    track = s.queue[s.index];
  return (
    <aside className="listening-queue" aria-label="Listening queue">
      <header>
        <div>
          <span className="eyebrow">LISTENING QUEUE</span>
          <h2>
            Your queue <small>{s.queue.length} tracks</small>
          </h2>
        </div>
        <button aria-label="Close listening queue" onClick={close}>
          <X size={18} />
        </button>
      </header>
      <div className="queue-tools">
        <span>
          {s.shuffle
            ? "Shuffle on · order chosen during playback"
            : "Plays in the order below"}
        </span>
        <button disabled={!track} onClick={() => libraryPlayer.clearUpcoming()}>
          Clear upcoming
        </button>
      </div>
      <ol>
        {s.queue.map((item, index) => (
          <li
            key={item.id + ":" + index}
            className={s.index === index ? "current" : ""}
          >
            <button
              className="queue-track"
              onClick={() => libraryPlayer.select(index)}
              aria-label={"Play " + item.title + ", " + item.version}
            >
              <Cover url={item.coverUrl} title={item.title} size={36} />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {s.index === index ? "Now playing · " : ""}
                  {item.version}
                </small>
              </span>
              <span>{durationLabel(item.duration)}</span>
            </button>
            <div className="queue-item-actions">
              <button
                aria-label={"Move " + item.version + " earlier"}
                disabled={
                  index === s.index || index === 0 || index - 1 === s.index
                }
                onClick={() => libraryPlayer.move(index, -1)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                aria-label={"Move " + item.version + " later"}
                disabled={
                  index === s.index ||
                  index === s.queue.length - 1 ||
                  index + 1 === s.index
                }
                onClick={() => libraryPlayer.move(index, 1)}
              >
                <ChevronDown size={14} />
              </button>
              <button
                aria-label={"Remove " + item.version + " from queue"}
                disabled={index === s.index}
                onClick={() => libraryPlayer.remove(index)}
              >
                <X size={14} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!s.queue.length && (
        <p className="queue-empty">Play a song or add one from your Library.</p>
      )}
    </aside>
  );
}
export function FavoriteSong({
  track,
  onError,
}: {
  track: LibraryTrack;
  onError: (error: unknown) => void;
}) {
  return (
    <button
      className={track.favorite ? "favorite" : ""}
      aria-label={
        track.favorite
          ? "Remove current song from favorites"
          : "Favorite current song"
      }
      onClick={() => void favoriteTrack(track).catch(onError)}
    >
      <Heart size={18} fill={track.favorite ? "currentColor" : "none"} />
    </button>
  );
}
