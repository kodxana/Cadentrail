import {
  generationInputSummary,
  generationScope,
  scoreGuidanceHint,
} from "./generationInputs";
import { setState, useStudio } from "./store";

export function ModelInputs() {
  const { project: p } = useStudio();
  if (!p) return null;
  const g = p.generation;
  const { issue, score, reference, words } = generationInputSummary(g);
  return (
    <details className="model-inputs">
      <summary>
        Next YuE2 take <span>· {reference} · Complete take</span>
      </summary>
      <div>
        {issue && <p className="reference-warning">{issue}</p>}
        <p>
          <strong>Sent to YuE2:</strong> music description, {words}
          {score
            ? ", and the saved ABC score."
            : g.hum
              ? ", and the attached hum."
              : ". Imported MIDI is not sent until you apply a melody reference."}
        </p>
        <p>
          <strong>Studio playback and Render audio:</strong> your clips, MIDI
          instruments, mixer and automation. {generationScope}
        </p>
        <p className="help">
          Arrange whole takes, imported recordings or separated stems. Stem
          separation estimates parts from finished audio; it is not
          solo-instrument generation.
        </p>
        {score && (
          <p className="help">
            The saved score is a snapshot. Reapply after piano-roll or chord
            edits. {scoreGuidanceHint}
          </p>
        )}
        <button
          onClick={() =>
            setState({
              view: g.abc.trim() || g.useScore ? "notation" : "score",
            })
          }
        >
          {g.abc.trim() || g.useScore
            ? "Review saved score"
            : "Choose a melody in Piano Roll"}
        </button>
      </div>
    </details>
  );
}
