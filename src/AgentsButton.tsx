import { Bot } from "lucide-react";
import "./agents.css";
export function AgentsButton() {
  return (
    <button
      type="button"
      className="agents-entry"
      title="Bring your own agent"
      aria-label="Agents"
      onClick={(event) => {
        event.currentTarget.focus();
        window.dispatchEvent(new Event("cadentrail:agents"));
      }}
    >
      <Bot size={17} />
      <span>Agents</span>
    </button>
  );
}
