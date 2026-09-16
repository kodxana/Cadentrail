import { Code2 } from "lucide-react";
export function IntegrationsButton() {
  return (
    <button
      type="button"
      title="API & Integrations"
      aria-label="API & Integrations"
      onClick={() => window.dispatchEvent(new Event("cadentrail:integrations"))}
    >
      <Code2 size={16} />
    </button>
  );
}
