import { useMemo, useState } from "react";
import { Download, History } from "lucide-react";
import { Dialog } from "./Dialog";
import { download } from "./api";
import { mergeChanges } from "./merge";
import { useStudio, resolveRecovery } from "./store";
export function RecoveryDialog() {
  const { recovery } = useStudio();
  const [choices, setChoices] = useState<Record<string, "local" | "remote">>(
    {},
  );
  const conflicts = useMemo(() => {
    const result: { path: string; local: unknown; remote: unknown }[] = [];
    if (recovery)
      mergeChanges(
        recovery.draft.base || recovery.server,
        recovery.draft.project,
        recovery.server,
        "project",
        (path, _base, local, remote) => {
          result.push({ path, local, remote });
          return local;
        },
      );
    return result;
  }, [recovery]);
  if (!recovery) return null;
  const preview = (v: unknown) =>
    typeof v === "string" ? v : (JSON.stringify(v, null, 2) ?? "Removed");
  return (
    <Dialog titleId="recovery-title" className="recovery-dialog">
      <div className="modal-title">
        <h2 id="recovery-title">
          {recovery.conflict
            ? "Resolve your project changes"
            : "Recover your unsaved work"}
        </h2>
      </div>
      <p>
        {recovery.draft.project.name} ·{" "}
        {new Date(recovery.draft.savedAt).toLocaleString()}
      </p>
      <p>
        {conflicts.length
          ? "Some values changed in both copies. Choose which to keep. Other edits and generated results are combined."
          : "A recovery copy is available on this browser. You can restore its edits into the current project."}
      </p>
      {conflicts.map(({ path, local, remote }) => (
        <fieldset key={path}>
          <legend>{path.replace("project.", "")}</legend>
          <div className="recovery-choices">
            {(["local", "remote"] as const).map((side) => (
              <label key={side}>
                <input
                  type="radio"
                  name={path}
                  checked={(choices[path] || "local") === side}
                  onChange={() => setChoices({ ...choices, [path]: side })}
                />
                {side === "local"
                  ? "Your recovery copy"
                  : "Saved on workstation"}
                <pre>{preview(side === "local" ? local : remote)}</pre>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="recovery-actions">
        <button
          onClick={() =>
            download(
              "Cadentrail-recovery.json",
              JSON.stringify(recovery.draft.project, null, 2),
              "application/json",
            )
          }
        >
          <Download size={16} />
          Download recovery copy
        </button>
        <button onClick={() => resolveRecovery({}, true)}>
          Discard this recovery copy
        </button>
        <button className="primary" onClick={() => resolveRecovery(choices)}>
          <History size={16} />
          {conflicts.length ? "Apply selected changes" : "Restore edits"}
        </button>
      </div>
    </Dialog>
  );
}
