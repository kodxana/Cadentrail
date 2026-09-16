import { voiceName } from "./lyricRoles";
import { engine } from "./audio";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, ArrowDown, Pencil, RefreshCw } from "lucide-react";
import { api } from "./api";
import { useStudio, openProject, getState, setState, edit } from "./store";
import { libraryPlayer, useLibraryPlayer } from "./libraryPlayer";
import { type LibraryTrack, durationLabel } from "./libraryModel";
import type { Project } from "./model";
import {
  resolveLiveLyrics,
  lyricPosition,
  usableWord,
  sameWords,
  activateSavedTiming,
} from "./liveLyrics";

export function LyricsView({
  track,
  close,
}: {
  track: LibraryTrack;
  close: () => void;
}) {
  const studio = useStudio(),
    playback = useLibraryPlayer();
  const local = studio.project?.id === track.projectId ? studio.project : null;
  const [remote, setRemote] = useState<Project | null>(null),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0),
    [follow, setFollow] = useState(true),
    [opening, setOpening] = useState(false),
    [layout, setLayout] = useState(0);
  const scroller = useRef<HTMLDivElement>(null),
    nodes = useRef(new Map<number, HTMLLIElement>());
  useEffect(() => {
    if (local) return;
    const controller = new AbortController();
    let alive = true;
    setError(null);
    void api<Project>("/projects/" + track.projectId, {
      signal: controller.signal,
    })
      .then((p) => {
        if (alive) setRemote(p);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [track.projectId, !!local, track.updatedAt, retry]);
  const project = local ?? (remote?.id === track.projectId ? remote : null);
  const lyricData = useMemo(
    () =>
      project
        ? resolveLiveLyrics(
            project,
            track.timingAssetIds ?? [track.id],
            track.duration,
          )
        : null,
    [project, track.id, track.timingAssetIds, track.duration],
  );
  const position = useMemo(
    () => lyricPosition(lyricData?.ranges ?? [], playback.time),
    [lyricData, playback.time],
  );
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setLayout((value) => value + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, [!!lyricData?.lines.length]);
  useEffect(() => {
    if (!follow || !lyricData?.timedCount) return;
    const container = scroller.current,
      node = nodes.current.get(position.anchor);
    if (!container || !node) return;
    const c = container.getBoundingClientRect(),
      r = node.getBoundingClientRect();
    const activeRects = position.active
      .map((i) => nodes.current.get(i)?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r);
    const top = activeRects.length
      ? Math.min(...activeRects.map((r) => r.top))
      : r.top;
    const bottom = activeRects.length
      ? Math.max(...activeRects.map((r) => r.bottom))
      : r.bottom;
    const groupFits = bottom - top < c.height * 0.85;
    const focusTop = groupFits ? top : r.top,
      focusHeight = groupFits ? bottom - top : r.height;
    container.scrollTo({
      top: Math.max(
        0,
        container.scrollTop + focusTop - c.top - (c.height - focusHeight) / 2,
      ),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [position.anchor, position.active.join(","), follow, lyricData, layout]);
  const editTiming = async () => {
    setOpening(true);
    try {
      engine.pause();
      await openProject(track.projectId);
      if (getState().project?.id !== track.projectId || getState().dirty) {
        setError("Save your current project before opening lyric timing.");
        return;
      }
      const sourceId = lyricData?.timing?.assetId ?? track.id;
      edit("Open saved lyric timing", (p) => activateSavedTiming(p, sourceId));
      setState({
        view: "visuals",
        visualsTab: "timing",
        timingSourceAssetId: lyricData?.timing?.assetId ?? track.id,
      });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  };
  const ready = !!lyricData?.timedCount;
  return (
    <section
      className={
        "live-lyrics" +
        (ready ? " is-synced" : "") +
        (follow ? " is-following" : "")
      }
      aria-label="Live lyrics"
    >
      <header className="lyric-panel-header">
        <span>LYRICS</span>
        <details className="lyric-details">
          <summary aria-label="Lyric timing details">
            {ready ? "Synced lyrics" : "Untimed lyrics"}
          </summary>
          <div>
            <strong>
              {ready
                ? `${lyricData!.timedCount} of ${lyricData!.lines.length} lines synced`
                : "This version has no lyric timing yet."}
            </strong>
            <p>
              {lyricData?.lyricsChanged
                ? "Showing the lyrics saved for this recording. Your project has newer edits."
                : "Only reliable saved timestamps are highlighted. Untimed lines stay readable."}
            </p>
            {lyricData?.timing?.needsReview && (
              <p>Alignment preview · review suggested.</p>
            )}
            <button
              disabled={opening || !project}
              onClick={() => void editTiming()}
            >
              <Pencil size={14} />
              {ready ? "Edit timing in Creation" : "Set up timing in Creation"}
            </button>
          </div>
        </details>
      </header>
      <div className="live-lyrics-content">
        {error && (
          <div role="alert" className="lyrics-message">
            {error}
            <button
              onClick={() => {
                setError(null);
                setRetry(retry + 1);
              }}
            >
              <RefreshCw size={14} />
              Try again
            </button>
          </div>
        )}
        {!project && !error ? (
          <div className="lyrics-empty" role="status">
            Loading lyrics…
          </div>
        ) : (
          lyricData && (
            <>
              {lyricData.lines.length ? (
                <div
                  ref={scroller}
                  className="live-lyrics-scroll"
                  aria-label="Scrolling song lyrics"
                  tabIndex={0}
                  onWheel={() => setFollow(false)}
                  onTouchStart={() => setFollow(false)}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) setFollow(false);
                  }}
                  onKeyDown={(e) => {
                    if (
                      [
                        "ArrowUp",
                        "ArrowDown",
                        "PageUp",
                        "PageDown",
                        "Home",
                        "End",
                      ].includes(e.key)
                    )
                      setFollow(false);
                  }}
                >
                  <ol>
                    {lyricData.lines.map((line, index) => {
                      const range = lyricData.ranges[index],
                        active = position.active.includes(index),
                        past = !!range && playback.time >= range.end;
                      const words =
                        !!range &&
                        !!lyricData.timing &&
                        line.words.length > 0 &&
                        sameWords(
                          line.words.map((w) => w.text).join(" "),
                          line.text,
                        );
                      const text = words
                        ? line.words.map((word, i) => {
                            const timed = usableWord(
                                word,
                                lyricData.timing!,
                                line,
                                track.duration,
                              ),
                              current =
                                timed &&
                                playback.time >= word.start! &&
                                playback.time < word.end!;
                            return (
                              <span
                                key={word.id}
                                data-current-word={current ? "true" : undefined}
                                className={
                                  current
                                    ? "word-current"
                                    : timed && playback.time >= word.end!
                                      ? "word-sung"
                                      : ""
                                }
                              >
                                {word.text}
                                {i < line.words.length - 1 ? " " : ""}
                              </span>
                            );
                          })
                        : line.text;
                      return (
                        <li
                          key={line.id}
                          ref={(el) => {
                            if (el) nodes.current.set(index, el);
                            else nodes.current.delete(index);
                          }}
                          data-line-index={index}
                          data-voice={line.voice ?? undefined}
                          data-active={active ? "true" : undefined}
                          className={
                            (active ? "lyric-current " : "") +
                            (past ? "lyric-past " : "") +
                            (Math.abs(index - position.anchor) > 2
                              ? "lyric-distant "
                              : "") +
                            (range ? "" : "lyric-untimed")
                          }
                        >
                          {line.voice &&
                            (index === 0 ||
                              lyricData.lines[index - 1].voice !==
                                line.voice) && (
                              <span className="lyric-voice-label">
                                {voiceName(line.voice, lyricData.timing)}
                              </span>
                            )}
                          {line.section &&
                            (index === 0 ||
                              lyricData.lines[index - 1].section !==
                                line.section) && (
                              <span className="live-lyrics-section">
                                {line.section}
                              </span>
                            )}
                          {range ? (
                            <button
                              aria-label={`Jump to ${durationLabel(range.start)}${line.voice ? " · " + voiceName(line.voice, lyricData.timing) : ""}: ${line.text}`}
                              aria-current={active ? "true" : undefined}
                              onClick={() => {
                                libraryPlayer.seek(range.start);
                                setFollow(true);
                              }}
                            >
                              <span className="lyric-start">
                                {durationLabel(range.start)}
                              </span>
                              <span>{text}</span>
                            </button>
                          ) : (
                            <p title="This line has no reliable timing">
                              {line.text}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : (
                <div className="lyrics-empty">
                  <AlignLeft size={42} />
                  <h2>No lyrics for this song yet</h2>
                  <p>
                    Add lyrics in Create, then align them in Visuals → Lyric
                    timing.
                  </p>
                </div>
              )}
              {!follow && ready && (
                <button
                  className="lyrics-resume"
                  onClick={() => setFollow(true)}
                >
                  <ArrowDown size={16} />
                  Follow song
                </button>
              )}
            </>
          )
        )}
      </div>
    </section>
  );
}
