import { useState } from "react";
import { X } from "lucide-react";
import { Dialog } from "./Dialog";
import { post } from "./api";
import { melodySources, scoreReference } from "./scoreReference";
import {
  edit,
  getState,
  notice,
  selectedClip,
  setState,
  useStudio,
} from "./store";

export function ScoreReferenceDialog({
  close,
  applied,
}: {
  close: () => void;
  applied: () => void;
}) {
  const { project: p } = useStudio();
  const sources = melodySources(p!);
  const [sourceId, setSourceId] = useState(
    selectedClip()?.id ?? sources[0]?.clip.id ?? "",
  );
  const [range, setRange] = useState<"clip" | "loop">("clip"),
    [harmony, setHarmony] = useState(false);
  const [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const source = sources.find((s) => s.clip.id === sourceId);
  let reference: ReturnType<typeof scoreReference> | undefined,
    problem = "Choose a melody clip.";
  try {
    if (source)
      reference = scoreReference(p!, source.track, source.clip, range, harmony);
  } catch (e) {
    problem = (e as Error).message;
  }
  const apply = async () => {
    if (!reference || !source || !p) return;
    setWorking(true);
    setError("");
    const request = { ...reference };
    try {
      const { abc } = await post<{ abc: string }>("/score/write", request);
      const current = getState().project;
      if (current?.id !== p.id) return;
      const latest = melodySources(current).find((s) => s.clip.id === sourceId);
      if (
        !latest ||
        JSON.stringify(
          scoreReference(current, latest.track, latest.clip, range, harmony),
        ) !== JSON.stringify(reference)
      )
        throw new Error(
          "The source changed while preparing the score. Review it and apply again.",
        );
      edit("Use MIDI melody reference", (next) => {
        next.generation.abc = abc;
        next.generation.useScore = true;
        next.generation.cot = harmony ? "full" : "melody";
      });
      setState({
        selectedTrack: source.track.id,
        selectedClips: [source.clip.id],
        selectedNotes: [],
      });
      notice(
        "Saved this melody for the next YuE2 take. Reapply after changing notes or chords.",
      );
      applied();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <Dialog
      titleId="score-reference-title"
      className="score-reference-dialog"
      onClose={working ? undefined : close}
    >
      <div className="modal-title">
        <h2 id="score-reference-title">Melody reference for YuE2</h2>
        <button
          aria-label="Close melody reference"
          disabled={working}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <p>
        Choose the melody you want the new performance to follow. Other Studio
        tracks are kept in your arrangement.
      </p>
      <label className="field">
        <span>Melody source</span>
        <select
          aria-label="Melody source"
          value={sourceId}
          disabled={working}
          onChange={(e) => {
            setSourceId(e.target.value);
            setError("");
          }}
        >
          <option value="">Choose a clip</option>
          {sources.map(({ track, clip }) => (
            <option
              key={clip.id}
              value={clip.id}
              disabled={track.instrument === "drums"}
            >
              {track.name} · {clip.name}
              {track.instrument === "drums" ? " (drums)" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="reference-fields">
        <label className="field">
          <span>Reference range</span>
          <select
            aria-label="Reference range"
            value={range}
            disabled={working}
            onChange={(e) => setRange(e.target.value as typeof range)}
          >
            <option value="clip">Entire clip</option>
            <option value="loop">Project loop region</option>
          </select>
        </label>
        <label className="field">
          <span>Guidance</span>
          <select
            aria-label="Guidance"
            value={harmony ? "full" : "melody"}
            disabled={working}
            onChange={(e) => setHarmony(e.target.value === "full")}
          >
            <option value="melody">Melody only</option>
            <option value="full">Melody + project chords</option>
          </select>
        </label>
      </div>
      {reference ? (
        <>
          <p className="reference-count">
            {reference.notes.length.toLocaleString()} notes ·{" "}
            {Number(reference.seconds.toFixed(1))} seconds of score ·{" "}
            {reference.chords.length} chord changes
          </p>
          {reference.polyphonic && (
            <p className="reference-warning">
              This part contains overlapping notes. They will all be included;
              YuE2 may interpret them as multiple voices. A clear single melody
              is a better starting point.
            </p>
          )}
          {reference.excludedDrums && (
            <p className="reference-warning">
              MIDI channel 10 percussion is excluded from this melody reference.
            </p>
          )}
          {range === "clip" && (
            <p className="help">
              Rests and repeats are kept. For a shorter phrase, set the Studio
              loop region and select it above. The score's duration is not a
              promised output length.
            </p>
          )}
        </>
      ) : (
        <p role="status">{problem}</p>
      )}
      <p className="help">
        This saves an ABC snapshot for the next complete take. Reapply after
        editing notes or chords. Instrument patches, expression, mixer effects
        and other clips are not sent. Melody reproduction can vary. Per-track AI
        rendering and replacement of a selected audio region are not supported.
      </p>
      {p?.generation.hum && (
        <p className="reference-warning">
          A hum is attached. Detach it before using a MIDI reference; your
          existing score and hum are preserved.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="reference-actions">
        <button disabled={working} onClick={close}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!reference || working || !!p?.generation.hum}
          onClick={() => void apply()}
        >
          {working ? "Preparing score…" : "Use for next take"}
        </button>
      </div>
    </Dialog>
  );
}
