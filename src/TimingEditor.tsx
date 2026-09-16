import { libraryPlayer } from "./libraryPlayer";
import { voiceName, type Voice } from "./lyricRoles";
import { useState } from "react";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Scissors,
  Merge,
  Plus,
} from "lucide-react";
import { useStudio, setState, edit, report, notice } from "./store";
import { SongPlayer, clock } from "./SongPlayer";
import { queueVisual } from "./visualActions";
import {
  makeLyricLines,
  nudgeLine,
  setLineBoundary,
  splitLine,
  mergeLine,
} from "./timing";
import { newVisuals, type LyricLine } from "./visual-model";
import { id } from "./model";
export function TimingEditor({
  available,
  upgraded,
}: {
  available: boolean;
  upgraded: boolean;
}) {
  const s = useStudio(),
    p = s.project!,
    timing = p.visuals.timing;
  const source =
    s.assets.find(
      (a) =>
        a.id ===
        (s.timingSourceAssetId ??
          p.visuals.video.audioAssetId ??
          timing.assetId),
    ) ?? s.assets[0];
  const [time, setTime] = useState(0),
    [seek, setSeek] = useState(0),
    [selected, setSelected] = useState(0),
    [splitAt, setSplitAt] = useState(1);
  const [backend, setBackend] = useState<"qwen3" | "whisper">("qwen3"),
    [detectVoices, setDetectVoices] = useState(true),
    [isolateVocals, setIsolateVocals] = useState(false),
    [maxVoices, setMaxVoices] = useState(2),
    [language, setLanguage] = useState("auto");
  const selectedBackend = upgraded ? backend : "whisper";
  const [onlyIssues,setOnlyIssues]=useState(false),[loopLine,setLoopLine]=useState(false);
  const needsAttention=(l:LyricLine)=>l.start===null||l.end===null||l.words.some(w=>w.start===null||(w.confidence!==null&&w.confidence<.75))||(l.voiceSource==="detected"&&(l.voiceConfidence==null||l.voiceConfidence<.8));
  const issues=timing.lines.map((l,i)=>needsAttention(l)?i:-1).filter(i=>i>=0);
  const stale=!!timing.sourceLyrics&&timing.sourceLyrics.trim()!==p.generation.lyrics.trim();
  const line = timing.lines[selected];
  const missing = timing.lines.filter((l) => l.start === null).length;
  const change = (label: string, fn: (line: LyricLine) => void) => {
    try {
      edit(label, (p) => {
        const l = p.visuals.timing.lines[selected];
        if (l) fn(l);
        p.visuals.timing.needsReview = true;
      });
    } catch (e) {
      report(e);
    }
  };
  const initialize = () =>
    edit("Start manual lyric timing", (p) => {
      if (p.visuals.timing.lines.length)
        p.visuals.timingHistory = [
          ...p.visuals.timingHistory,
          p.visuals.timing,
        ].slice(-50);
      p.visuals.timing = {
        ...newVisuals().timing,
        assetId: source?.id ?? null,
        sourceLyrics: p.generation.lyrics,
        lines: makeLyricLines(p.generation.lyrics),
      };
    });
  return (
    <div className="timing-workspace">
      <div className="timing-toolbar">
        <label>
          Audio take
          <select
            value={source?.id ?? ""}
            onChange={(e) => setState({ timingSourceAssetId: e.target.value })}
          >
            {s.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!source || !available || !p.generation.lyrics.trim()}
          onClick={() =>
            void queueVisual(
              "align",
              {
                lyrics: p.generation.lyrics,
                language,
                backend: selectedBackend,
                detectVoices,
                isolateVocals,
                maxVoices,
              },
              source?.id,
            ).catch(report)
          }
        >
          Align lyrics
        </button>
        <button
          disabled={!source || !p.generation.lyrics.trim()}
          onClick={initialize}
        >
          Start manual timing
        </button>
        <span className="spacer" />
        <button
          disabled={
            !timing.lines.length || !!missing || stale || timing.assetId !== source?.id
          }
          className={!timing.needsReview ? "active" : ""}
          onClick={() =>
            edit("Reviewed lyric timing", (p) => {
              p.visuals.timing.needsReview = false;
            })
          }
        >
          <Check size={14} />
          {timing.needsReview ? "Mark timing reviewed" : "Timing reviewed"}
        </button>
      </div>
      <details className="alignment-options">
        <summary>
          Alignment options ·{" "}
          {selectedBackend === "qwen3"
            ? "Qwen3 song alignment"
            : "Whisper large-v3"}
          {selectedBackend === "qwen3" && detectVoices
            ? " · voice detection"
            : ""}
        </summary>
        <div className="simple-options">
          <label className="field">
            <span>Alignment engine</span>
            <select
              value={selectedBackend}
              onChange={(e) =>
                setBackend(e.target.value as "qwen3" | "whisper")
              }
            >
              <option value="qwen3" disabled={!upgraded}>
                Qwen3 + Whisper · hybrid song alignment
              </option>
              <option value="whisper">
                Whisper large-v3 · legacy matching
              </option>
            </select>
          </label>
          <label className="field">
            <span>Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {[
                ["auto", "Detect automatically"],
                ["en", "English"],
                ["zh", "Chinese"],
                ["yue", "Cantonese"],
                ["fr", "French"],
                ["de", "German"],
                ["it", "Italian"],
                ["ja", "Japanese"],
                ["ko", "Korean"],
                ["pt", "Portuguese"],
                ["ru", "Russian"],
                ["es", "Spanish"],
              ].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedBackend === "qwen3" && (
          <div className="alignment-toggles">
            <label>
              <input
                type="checkbox"
                checked={isolateVocals}
                onChange={(e) => setIsolateVocals(e.target.checked)}
              />
              Isolate vocals first
            </label>
            <label>
              <input
                type="checkbox"
                checked={detectVoices}
                onChange={(e) => setDetectVoices(e.target.checked)}
              />
              Detect voices
            </label>
            {detectVoices && (
              <label>
                Up to{" "}
                <select
                  aria-label="Maximum voices"
                  value={maxVoices}
                  onChange={(e) => setMaxVoices(+e.target.value)}
                >
                  <option value={2}>2 voices · duet</option>
                  <option value={4}>4 voices</option>
                </select>
              </label>
            )}
          </div>
        )}
        <p className="help">
          Optional models download after confirmation. Automatic voice labels
          are suggestions; review harmonies and overlapping vocals.
        </p>
      </details>
      {source ? (
        <SongPlayer
          assetId={source.id}
          name={source.name}
          duration={source.duration}
          onTime={value=>{setTime(value);if(loopLine&&line?.start!==null&&line?.end!=null&&value>=line.end)libraryPlayer.seek(line.start);}}
          seekTo={seek}
        />
      ) : (
        <p className="help">Generate or import a song first.</p>
      )}
      {stale&&<p className="timing-warning">Lyrics changed after these timings were made. Re-align or start manual timing before marking them reviewed.</p>}
      <div className="timing-toolbar"><button disabled={!issues.length} onClick={()=>{const next=issues.find(i=>i>selected)??issues[0];setSelected(next);if(timing.lines[next].start!==null)setSeek(timing.lines[next].start!);}}>Next issue · {issues.length}</button><label><input type="checkbox" checked={onlyIssues} onChange={e=>setOnlyIssues(e.target.checked)}/> Show issues only</label><button className={loopLine?"active":""} disabled={line?.start==null||line?.end==null} onClick={()=>{setLoopLine(!loopLine);if(line?.start!=null)setSeek(line.start);}}>Loop selected line</button></div>
      <div className="timing-status">
        <strong>
          {missing
            ? `${missing} lines need timing`
            : timing.lines.length
              ? "All lines have start and end times"
              : "Lyrics are ready when you are."}
        </strong>
        <span>
          {timing.coverage !== null
            ? `${Math.round(timing.coverage * 100)}% of words matched · review before export`
            : "Set line boundaries during playback. Word timing is optional."}
        </span>
        {source && timing.assetId && source.id !== timing.assetId && (
          <em>
            These timings belong to another take. Align this take or start
            manual timing.
          </em>
        )}
      </div>
      {timing.warnings?.map((warning, i) => (
        <p key={i} className="timing-warning">
          {warning}
        </p>
      ))}
      <div className="timing-layout">
        <section className="lyric-lines" aria-label="Lyric lines">
          {timing.lines.map((l, i) => (!onlyIssues || needsAttention(l)) && (
            <button
              key={l.id}
              className={
                (selected === i ? "selected " : "") +
                (l.start !== null && time >= l.start && time < l.end!
                  ? "playing"
                  : "")
              }
              onClick={() => {
                setSelected(i);
                if (l.start !== null) setSeek(l.start);
              }}
            >
              <span className="line-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <small>
                  {l.section}
                  {l.voice ? " · " + voiceName(l.voice, timing) : ""}
                </small>
                <strong>{l.text}</strong>
              </div>
              <span className="timecode">
                {l.start === null
                  ? "Untimed"
                  : clock(l.start) + " — " + clock(l.end!)}
              </span>
            </button>
          ))}
          {!timing.lines.length && (
            <div className="empty-timing">
              <h2>Put the words in time.</h2>
              <p>
                Align the song automatically, then listen and correct. Or set
                each line yourself.
              </p>
              <p>
                Uncertain words stay untimed. Nothing is evenly spaced to look
                synchronized.
              </p>
            </div>
          )}
        </section>
        <aside className="timing-inspector">
          {line ? (
            <>
              <div className="panel-title">
                LINE {selected + 1}
                <span className="timecode">Playhead {time.toFixed(2)}s</span>
              </div>
              <label className="field">
                <span>
                  Voice for this line{" "}
                  {line.voiceSource === "detected"
                    ? "· detected suggestion"
                    : ""}
                </span>
                <select
                  aria-label="Voice for this line"
                  value={line.voice ?? ""}
                  onChange={(e) =>
                    change("Assign lyric voice", (l) => {
                      l.voice = (e.target.value || null) as Voice | null;
                      l.voiceSource = "manual";
                      l.voiceConfidence = null;
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {(["a", "b", "c", "d", "together"] as const).map((v) => (
                    <option key={v} value={v}>
                      {voiceName(v, timing)}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label="Lyric line text"
                value={line.text}
                onChange={(e) =>
                  change("Edit lyric line", (l) => {
                    l.text = e.target.value;
                    l.words = makeLyricLines(e.target.value)[0]?.words ?? [];
                  })
                }
              />
              <div className="simple-options">
                {(["start", "end"] as const).map((key) => (
                  <label className="field" key={key}>
                    <span>{key} · seconds</span>
                    <input
                      type="number"
                      min="0"
                      step=".01"
                      value={line[key] == null ? "" : +line[key].toFixed(3)}
                      placeholder="Untimed"
                      onChange={(e) => {
                        if (e.target.value === "") {
                          change("Clear line timing", (l) => {
                            l.start = l.end = null;
                          });
                          return;
                        }
                        change("Line " + key, (l) =>
                          setLineBoundary(l, key, +e.target.value),
                        );
                      }}
                    />
                    <button
                      onClick={() =>
                        change("Set " + key + " at playhead", (l) =>
                          setLineBoundary(l, key, time),
                        )
                      }
                    >
                      Set {key} at playhead
                    </button>
                  </label>
                ))}
              </div>
              <div className="timing-actions">
                <button
                  onClick={() =>
                    change("Nudge earlier", (l) => nudgeLine(l, -0.1))
                  }
                >
                  <ChevronLeft size={13} />
                  0.1s
                </button>
                <button
                  onClick={() =>
                    change("Nudge later", (l) => nudgeLine(l, 0.1))
                  }
                >
                  0.1s
                  <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => {
                    try {
                      edit("Merge lyric lines", (p) =>
                        mergeLine(p.visuals.timing, selected),
                      );
                    } catch (e) {
                      report(e);
                    }
                  }}
                  disabled={selected === timing.lines.length - 1}
                >
                  <Merge size={13} />
                  Merge next
                </button>
              </div>
              <div className="inline-field">
                <span>Split after word</span>
                <input
                  aria-label="Split after word"
                  type="number"
                  min="1"
                  max={line.words.length - 1}
                  value={splitAt}
                  onChange={(e) => setSplitAt(+e.target.value)}
                />
                <button
                  disabled={line.words.length < 2}
                  onClick={() =>
                    edit("Split lyric line", (p) =>
                      splitLine(p.visuals.timing, selected, splitAt),
                    )
                  }
                >
                  <Scissors size={13} />
                  Split
                </button>
              </div>
              <details open className="word-timing">
                <summary>Word timing</summary>
                <div className="word-table-heading">
                  <span>Word</span>
                  <span>Start</span>
                  <span>End</span>
                </div>
                {line.words.map((w, i) => (
                  <div className="word-row" key={w.id}>
                    <span>{w.text}</span>
                    {(["start", "end"] as const).map((key) => (
                      <input
                        key={key}
                        aria-label={w.text + " " + key}
                        type="number"
                        min="0"
                        step=".01"
                        value={w[key] ?? ""}
                        placeholder="—"
                        onChange={(e) => {
                          const value = e.target.value;
                          change("Correct word timing", (l) => {
                            const word = l.words[i];
                            if (value === "") {
                              word.start = word.end = null;
                              return;
                            }
                            word[key] = +value;
                            if (word.start === null)
                              word.start = Math.max(0, word.end! - 0.3);
                            if (word.end === null) word.end = word.start + 0.3;
                            if (word.end <= word.start)
                              throw new Error("Word end must follow start.");
                            const prev = l.words[i - 1],
                              next = l.words[i + 1];
                            if (
                              (prev?.end !== null &&
                                prev?.end !== undefined &&
                                prev.end > word.start) ||
                              (next?.start !== null &&
                                next?.start !== undefined &&
                                next.start < word.end)
                            )
                              throw new Error(
                                "Word timing overlaps a neighbor.",
                              );
                            l.start = Math.min(
                              l.start ?? word.start,
                              word.start,
                            );
                            l.end = Math.max(l.end ?? word.end, word.end);
                            word.source = "manual";
                            word.confidence = null;
                          });
                        }}
                      />
                    ))}
                  </div>
                ))}
              </details>
              <button
                onClick={() =>
                  edit("Remove lyric line", (p) => {
                    p.visuals.timing.lines.splice(selected, 1);
                    p.visuals.timing.needsReview = true;
                  })
                }
              >
                Remove line
              </button>
            </>
          ) : (
            <p className="help">Choose a line to correct its timing.</p>
          )}
          <details className="voice-names">
            <summary>Voice names</summary>
            {(["a", "b", "c", "d"] as const).map((v) => (
              <label className="field" key={v}>
                <span>Voice {v.toUpperCase()}</span>
                <input
                  maxLength={60}
                  value={
                    timing.voices?.find((item) => item.id === v)?.name ?? ""
                  }
                  placeholder={"Voice " + v.toUpperCase()}
                  onChange={(e) =>
                    edit("Rename lyric voice", (p) => {
                      const voices = (p.visuals.timing.voices ??= []);
                      const existing = voices.find((item) => item.id === v);
                      if (existing) existing.name = e.target.value;
                      else voices.push({ id: v, name: e.target.value });
                    })
                  }
                />
              </label>
            ))}
          </details>
          <details className="timing-history">
            <summary>
              Previous alignments · {p.visuals.timingHistory.length}
            </summary>
            {p.visuals.timingHistory.map((t, i) => (
              <button
                key={i}
                onClick={() =>
                  edit("Restore previous lyric timing", (p) => {
                    const chosen = JSON.parse(
                      JSON.stringify(p.visuals.timingHistory[i]),
                    );
                    p.visuals.timingHistory = [
                      ...p.visuals.timingHistory,
                      p.visuals.timing,
                    ].slice(-50);
                    p.visuals.timing = chosen;
                  })
                }
              >
                {t.model ?? "Manual"} · {t.lines.length} lines
              </button>
            ))}
          </details>
        </aside>
      </div>
    </div>
  );
}
