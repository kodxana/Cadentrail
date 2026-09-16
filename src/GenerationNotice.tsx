import { TriangleAlert } from "lucide-react";
import { generationLimit } from "./generationPresentation";

export function GenerationNotice({
  value,
  onPrepare,
}: {
  value: unknown;
  onPrepare?: () => void;
}) {
  const message = generationLimit(value);
  if (!message) return null;
  return (
    <div
      className="generation-limit"
      role="note"
      aria-label="Generation limit reached"
    >
      <TriangleAlert size={17} aria-hidden="true" />
      <div>
        <strong>Generation limit reached</strong>
        <p>{message}</p>
      </div>
      {onPrepare && <button onClick={onPrepare}>Prepare new take</button>}
    </div>
  );
}
