import { X } from "lucide-react";
import { Dialog } from "./Dialog";
import type { Candidate } from "./model";
import { edit, setState, useStudio } from "./store";
import { scoreGuidanceHint } from "./generationInputs";

export function CandidateScoreDialog({
  candidate,
  close,
}: {
  candidate: Candidate;
  close: () => void;
}) {
  const { project } = useStudio();
  return (
    <Dialog
      titleId="candidate-score-title"
      className="candidate-score-dialog"
      onClose={close}
    >
      <div className="modal-title">
        <h2 id="candidate-score-title">Generated score</h2>
        <button aria-label="Close generated score" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <p>
        {candidate.name} · Inspection leaves your current generation settings
        unchanged.
      </p>
      <textarea
        className="abc-source"
        aria-label="Generated ABC preview"
        readOnly
        value={candidate.abc}
      />
      <p className="help">
        {scoreGuidanceHint} This is the model’s score, not a transcription of
        every instrument in the finished audio.
      </p>
      {project?.generation.hum && (
        <p className="reference-warning">
          A hum is attached. Detach it before enabling a different score
          reference.
        </p>
      )}
      <div className="reference-actions">
        <button onClick={close}>Close</button>
        <button
          className="primary"
          disabled={!candidate.abc.trim() || !!project?.generation.hum}
          onClick={() => {
            edit("Use candidate score", (p) => {
              p.generation.abc = candidate.abc;
              p.generation.useScore = true;
              if (p.generation.cot === "off") p.generation.cot = "full";
            });
            close();
            setState({ view: "notation" });
          }}
        >
          Use this score for next take
        </button>
      </div>
    </Dialog>
  );
}
