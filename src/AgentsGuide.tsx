import { useEffect, useState } from "react";
import {
  Bot,
  X,
  Plug,
  MessageSquare,
  RefreshCw,
  ArrowUpRight,
  KeyRound,
  Code2,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { useStudio } from "./store";
import { api } from "./api";
import Code from "./IntegrationCode";
import RunpodIntegration from "./RunpodIntegration";
import {
  agentTasks,
  agentTaskBrief,
  type AgentGuideState,
  type AgentClient,
} from "./agentGuide";
import { jobName } from "./Jobs";
import "./integrations.css";
import "./agents.css";

type Connection = {
  id: string;
  name: string;
  expiresAt: number;
  revokedAt: number | null;
  lastUsedAt: number | null;
  scopes: string[];
};
type Props = {
  state: AgentGuideState;
  change: (patch: Partial<AgentGuideState>) => void;
  close: () => void;
  setup: (tab: "connect" | "tokens" | "reference", client: AgentClient) => void;
};
const pages = [
  ["start", "Get started", Bot],
  ["tasks", "Give it a task", MessageSquare],
  ["connections", "My connections", Plug],
  ["reconnect", "Reconnect", RefreshCw],
] as const;
export default function AgentsGuide({ state, change, close, setup }: Props) {
  const studio = useStudio();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [workstationId, setWorkstationId] = useState<string>();
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const refresh = async () => {
    setError("");
    try {
      const [keys, session] = await Promise.all([
        api<Connection[]>("/integrations/tokens"),
        api<{ workstationId: string }>("/session"),
      ]);
      setConnections(keys);
      setWorkstationId(session.workstationId);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const active = connections.filter(
    (c) => !c.revokedAt && c.expiresAt > Date.now() / 1000,
  );
  const selectedProject = state.useProject ? studio.project : null;
  const tasks = agentTasks(selectedProject?.generation.role === "instrumental");
  const selected = tasks.find((t) => t.id === state.task) ?? tasks[0];
  const unsaved = Boolean(selectedProject && studio.dirty);
  const jobs = studio.jobs.filter((j) => j.agent).slice(0, 6);
  return (
    <Dialog
      className="integrations agents-guide"
      titleId="agents-title"
      onClose={close}
    >
      <header className="integration-header">
        <div>
          <span className="eyebrow">CADENTRAIL · YOUR CREATIVE TOOLS</span>
          <h2 id="agents-title">Agents</h2>
          <p>Bring the assistant you already use.</p>
        </div>
        <button autoFocus aria-label="Close Agents" onClick={close}>
          <X size={20} />
        </button>
      </header>
      <div className="integration-layout">
        <nav aria-label="Agent sections">
          {pages.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={state.page === id ? "page" : undefined}
              onClick={() => change({ page: id })}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
          <small>
            Your projects.
            <br />
            Your choice of agent.
            <br />
            Your permissions.
          </small>
          <button
            className="agents-api-link"
            onClick={() => setup("reference", state.client)}
          >
            <Code2 size={16} />
            <span>API documentation</span>
          </button>
        </nav>
        <section
          className="integration-content"
          aria-label={pages.find((p) => p[0] === state.page)?.[1]}
        >
          {state.page === "start" && (
            <>
              <h3>Bring your own agent</h3>
              <p>
                Connect Codex, Claude Code or another assistant that supports
                MCP. Talk to it in its own app; its work appears in your
                Cadentrail projects and queue.
              </p>
              <div
                className="agents-client-choices"
                aria-label="Choose your agent"
              >
                {(["Codex", "Claude Code", "Other agent"] as const).map(
                  (client) => (
                    <button
                      aria-pressed={state.client === client}
                      key={client}
                      onClick={() => change({ client })}
                    >
                      {client}
                      <span>
                        {client === "Other agent"
                          ? "Any compatible MCP client"
                          : "Use your existing assistant"}
                      </span>
                    </button>
                  ),
                )}
              </div>
              <ol className="integration-steps agents-start-steps">
                <li>
                  <strong>Choose what it can do</strong>
                  <span>
                    Give your assistant a named access token for reading,
                    creating music or producing exports. You can revoke it
                    later.
                  </span>
                  <button onClick={() => setup("tokens", state.client)}>
                    <KeyRound size={15} /> Choose access
                  </button>
                </li>
                <li>
                  <strong>Connect it to this workstation</strong>
                  <span>
                    {state.client === "Other agent"
                      ? "Your client needs Streamable HTTP MCP and a private Bearer token."
                      : "Follow the " +
                        state.client +
                        " connection example."}{" "}
                    Keep the token in your agent’s private settings or
                    environment.
                  </span>
                  <button onClick={() => setup("connect", state.client)}>
                    Set up{" "}
                    {state.client === "Other agent" ? "my agent" : state.client}{" "}
                    <ArrowUpRight size={14} />
                  </button>
                </li>
                <li>
                  <strong>Ask for help with your music</strong>
                  <span>
                    Start with lyrics, a musical idea, stems or release assets.
                    You choose the project and the work you want.
                  </span>
                  <button onClick={() => change({ page: "tasks" })}>
                    Choose a starting task <MessageSquare size={14} />
                  </button>
                </li>
              </ol>
              <div className="agents-explainer">
                <strong>What happens next?</strong>
                <p>
                  Your agent uses the same music engine and saved projects as
                  the app. Accepted jobs continue in the queue, and their
                  results stay with the project. It can help with creative work;
                  playback and some advanced Studio edits still need the
                  browser.
                </p>
              </div>
              <p className="integration-note">
                Installing an agent is separate from Cadentrail. This guide
                helps connect the one you choose; it does not start a chat
                session or run work on its own.
              </p>
            </>
          )}
          {state.page === "tasks" && (
            <>
              <h3>What would you like help with?</h3>
              <p>
                Choose a starting point, add your direction, then copy the
                request into your connected agent.
              </p>
              {studio.project && (
                <label className="agents-project-choice">
                  <input
                    type="checkbox"
                    checked={state.useProject}
                    onChange={(e) => change({ useProject: e.target.checked })}
                  />
                  <span>
                    Use current project<strong>{studio.project.name}</strong>
                    <small>
                      The request includes its name and ID. The agent reads the
                      saved project through its connection.
                    </small>
                  </span>
                </label>
              )}
              <div className="agents-task-list">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    aria-pressed={selected.id === t.id}
                    onClick={() => change({ task: t.id })}
                  >
                    <strong>{t.label}</strong>
                    <span>{t.description}</span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
              <label className="integration-request">
                Your direction
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={state.request}
                  onChange={(e) => change({ request: e.target.value })}
                  placeholder={
                    selectedProject?.generation.role === "instrumental"
                      ? "For example: warm solo piano, a quiet intro, a gradual build…"
                      : "For example: warm acoustic music, Japanese lyrics, an intimate first verse…"
                  }
                />
              </label>
              {unsaved ? (
                <div className="agents-explainer" role="status">
                  <strong>Save your project first</strong>
                  <p>
                    Your agent can read saved changes. Return to the project and
                    finish saving before copying a task for it.
                  </p>
                  <button onClick={close}>Return to project</button>
                </div>
              ) : (
                <Code
                  text={agentTaskBrief(
                    location.origin,
                    state,
                    studio.project,
                    workstationId,
                  )}
                  label="Copy task for my agent"
                />
              )}
              <p className="integration-note">
                Paste the request into{" "}
                {state.client === "Other agent"
                  ? "your assistant"
                  : state.client}
                . Copying it does not submit a job. Never put an access token in
                this request.
              </p>
            </>
          )}
          {state.page === "connections" && (
            <>
              <div className="integration-actions">
                <h3>My connections</h3>
                <button onClick={() => void refresh()}>
                  <RefreshCw size={14} /> Refresh activity
                </button>
              </div>
              <p>
                See which agents have access and when their tokens were last
                used. This is request history, not an online indicator.
              </p>
              {error && (
                <div className="integration-error" role="alert">
                  {error}
                  <button onClick={() => void refresh()}>
                    Retry connections
                  </button>
                </div>
              )}
              {!loaded && !error && <p role="status">Reading connections…</p>}
              {loaded && !active.length && (
                <div className="agents-explainer">
                  <strong>No active connections yet</strong>
                  <p>Create a named token, then finish setup in your agent.</p>
                </div>
              )}
              <div className="agents-connections">
                {active.map((c) => (
                  <article key={c.id}>
                    <Plug size={18} />
                    <div>
                      <strong>{c.name}</strong>
                      <span>
                        {c.lastUsedAt
                          ? "Last request " +
                            new Date(c.lastUsedAt * 1000).toLocaleString()
                          : "Access granted · not used yet"}
                      </span>
                      <small>
                        Access expires{" "}
                        {new Date(c.expiresAt * 1000).toLocaleDateString()}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
              <button onClick={() => setup("tokens", state.client)}>
                Manage access and permissions <ArrowUpRight size={14} />
              </button>
              <h4>Recent agent work</h4>
              {jobs.length ? (
                <div className="agents-connections">
                  {jobs.map((j) => (
                    <article key={j.id}>
                      <MessageSquare size={18} />
                      <div>
                        <strong>{jobName(j)}</strong>
                        <span>
                          {j.state}
                          {j.projectName ? " · " + j.projectName : ""}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="integration-note">
                  Agent jobs will appear here after an agent submits work. Saved
                  results remain in the project and Library.
                </p>
              )}
            </>
          )}
          {state.page === "reconnect" && (
            <RunpodIntegration connect={() => setup("connect", state.client)} />
          )}
        </section>
      </div>
    </Dialog>
  );
}
