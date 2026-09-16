import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { api } from "./api";
import { type Peaks } from "./model";
import { report } from "./store";
import { libraryPlayer, useLibraryPlayer } from "./libraryPlayer";
import { projectAudioTrack, getMusicLibrary } from "./libraryData";
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export function SongWave({
  assetId,
  time = 0,
  duration = 1,
  onSeek,
  height = 48,
}: {
  assetId: string;
  time?: number;
  duration?: number;
  onSeek?: (seconds: number) => void;
  height?: number;
}) {
  const [path, setPath] = useState("");
  useEffect(() => {
    let alive = true;
    void api<Peaks>("/assets/" + assetId + "/peaks?points=800")
      .then((data) => {
        const values = data.peaks.map((frame) => frame[0]);
        const step = Math.max(1, Math.floor(values.length / 240));
        let p = "";
        for (let i = 0; i < values.length; i += step) {
          const value = values[i];
          const low = value[0] ?? 0,
            high = value[1] ?? 0;
          const x = (i / Math.max(1, values.length - 1)) * 1000;
          p += `M${x.toFixed(1)},${(25 - low * 23).toFixed(1)}L${x.toFixed(1)},${(25 - high * 23).toFixed(1)}`;
        }
        if (alive) setPath(p);
      })
      .catch(report);
    return () => {
      alive = false;
    };
  }, [assetId]);
  return (
    <svg
      className="song-wave"
      role={onSeek ? "slider" : "img"}
      aria-label="Song waveform"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={time}
      tabIndex={onSeek ? 0 : undefined}
      viewBox="0 0 1000 50"
      preserveAspectRatio="none"
      style={{ height }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek?.(((e.clientX - r.left) / r.width) * duration);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          onSeek?.(
            Math.max(
              0,
              Math.min(duration, time + (e.key === "ArrowRight" ? 5 : -5)),
            ),
          );
        }
      }}
    >
      <path d={path} stroke="currentColor" strokeWidth="2" />
      <line
        x1={(time / Math.max(1, duration)) * 1000}
        x2={(time / Math.max(1, duration)) * 1000}
        y1="0"
        y2="50"
        stroke="var(--accent)"
        strokeWidth="3"
      />
    </svg>
  );
}
export function SongPlayer({
  assetId,
  name,
  duration,
  onTime,
  seekTo,
}: {
  assetId: string;
  name: string;
  duration: number;
  onTime?: (time: number) => void;
  seekTo?: number;
}) {
  const playback = useLibraryPlayer();
  const active = playback.queue[playback.index]?.id === assetId;
  const previous = useRef(assetId);
  const initialSeek = useRef(seekTo);
  const track = projectAudioTrack(assetId, name, duration);
  const select = (time = 0, autoplay = true) => {
    const candidates = getMusicLibrary().tracks.filter(
      (t) => t.projectId === track.projectId && t.kind !== "stem",
    );
    const index = candidates.findIndex((t) => t.id === assetId);
    libraryPlayer.playQueue(
      index < 0 ? [track] : candidates,
      index < 0 ? 0 : index,
      time,
      autoplay,
    );
  };
  useEffect(() => {
    if (
      previous.current !== assetId &&
      libraryPlayer.current()?.id === previous.current
    ) {
      const state = libraryPlayer.snapshot();
      select(state.time, state.playing || state.loading);
    }
    previous.current = assetId;
  }, [assetId]);
  useEffect(() => {
    if (active) onTime?.(playback.time);
  }, [active, playback.time, onTime]);
  useEffect(() => {
    if (seekTo === initialSeek.current) return;
    initialSeek.current = seekTo;
    if (seekTo !== undefined) {
      if (active) libraryPlayer.seek(seekTo);
      else select(seekTo, false);
    }
  }, [seekTo]);
  const seek = (time: number) => {
    if (active) libraryPlayer.seek(time);
    else select(time, false);
    onTime?.(time);
  };
  return (
    <div className="song-player">
      <button
        className="song-play"
        aria-label={active && playback.playing ? "Pause song" : "Play song"}
        onClick={() => (active ? libraryPlayer.toggle() : select())}
      >
        {active && playback.playing ? (
          <Pause size={20} fill="currentColor" />
        ) : (
          <Play size={20} fill="currentColor" />
        )}
      </button>
      <div className="song-player-main">
        <strong>{name}</strong>
        <SongWave
          assetId={assetId}
          duration={duration}
          time={active ? playback.time : 0}
          onSeek={seek}
        />
      </div>
      <span className="timecode">
        {clock(active ? playback.time : 0)} / {clock(duration)}
      </span>
    </div>
  );
}
