import { edit, useStudio } from "./store";
import { generationInputIssue, scoreUseLabel } from "./generationInputs";

export function ScoreUseControl() {
  const g = useStudio().project!.generation;
  const issue = generationInputIssue(g);
  return (
    <div className="score-use-control">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={g.useScore}
          disabled={!g.useScore && (!g.abc.trim() || !!g.hum)}
          onChange={(e) =>
            edit("Choose score reference", (p) => {
              p.generation.useScore = e.target.checked;
              if (e.target.checked && p.generation.cot === "off")
                p.generation.cot = "full";
            })
          }
        />
        {scoreUseLabel}
      </label>
      <p className="help">
        {issue ??
          (g.useScore
            ? "The saved ABC is used for the next complete take. Apply piano-roll edits again to update it."
            : g.hum
              ? "Detach the hum before enabling a separate ABC reference."
              : "This score is not used for generation until enabled. Studio playback is separate.")}
      </p>
    </div>
  );
}
