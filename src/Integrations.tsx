import { useEffect, useState } from "react";
import {
  X,
  KeyRound,
  Plug,
  BookOpen,
  Activity,
  Code2,
  RefreshCw,
  ShieldCheck,
  Server,
  Bot,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { api, post } from "./api";
import "./integrations.css";
import Code from "./IntegrationCode";
import RunpodIntegration from "./RunpodIntegration";

type Scope = { id: string; name: string; description: string };
type Capabilities = {
  version: string;
  auth: { passwordRequired: boolean; scopes: Scope[] };
  music: { renderSteps: Record<string, number> };
  limits: string[];
};
type Token = {
  id: string;
  name: string;
  scopes: string[];
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  token?: string;
};
type EventRow = {
  id: number;
  name: string;
  created: number;
  method: string;
  path: string;
  status: number;
};
type Operation = {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: unknown[];
  requestBody?: unknown;
  responses: unknown;
  "x-agent-scopes"?: string[];
};
type Reference = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, unknown> };
};
const tabs = [
  ["connect", "Connect", Plug],
  ["runpod", "Runpod", Server],
  ["tokens", "Access tokens", KeyRound],
  ["reference", "API reference", Code2],
  ["workflow", "Agent guide", BookOpen],
  ["activity", "Activity", Activity],
] as const;
const presets: Record<string, string[]> = {
  Reader: ["read"],
  Creator: ["read", "projects:write", "generation:run"],
  Production: [
    "read",
    "projects:write",
    "generation:run",
    "audio:process",
    "visuals:render",
    "jobs:manage",
  ],
};
const date = (value: number | null) =>
  value ? new Date(value * 1000).toLocaleString() : "Never";
export default function Integrations({
  close,
  initialTab = "connect",
  initialClient = "Codex",
  openAgents,
}: {
  close: () => void;
  initialTab?: string;
  initialClient?: string;
  openAgents?: () => void;
}) {
  const [tab, setTab] = useState(initialTab),
    [caps, setCaps] = useState<Capabilities | null>(null),
    [tokens, setTokens] = useState<Token[]>([]),
    [events, setEvents] = useState<EventRow[]>([]),
    [reference, setReference] = useState<Reference | null>(null),
    [guide, setGuide] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [name, setName] = useState(""),
    [days, setDays] = useState(30),
    [scopes, setScopes] = useState(presets.Creator),
    [secret, setSecret] = useState<Token | null>(null),
    [revoke, setRevoke] = useState<string | null>(null),
    [test, setTest] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState("GET /api/projects"),
    [client, setClient] = useState(initialClient);
  const refresh = async () => {
    setError("");
    try {
      const [c, t, r, g, e] = await Promise.all([
        api<Capabilities>("/integrations/capabilities"),
        api<Token[]>("/integrations/tokens"),
        api<Reference>("/openapi.json"),
        api<{ text: string }>("/integrations/guide"),
        api<EventRow[]>("/integrations/activity"),
      ]);
      setCaps(c);
      setTokens(t);
      setReference(r);
      setGuide(g.text);
      setEvents(e);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const origin = location.origin,
    endpoint = origin + "/api/mcp";
  const configs: Record<string, string> = {
    Codex: `[mcp_servers.cadentrail]\nurl = ${JSON.stringify(endpoint)}\nbearer_token_env_var = "CADENTRAIL_TOKEN"\ntool_timeout_sec = 60`,
    "Claude Code": JSON.stringify(
      {
        mcpServers: {
          cadentrail: {
            type: "http",
            url: endpoint,
            headers: { Authorization: "Bearer ${CADENTRAIL_TOKEN}" },
          },
        },
      },
      null,
      2,
    ),
    "Other MCP":
      "Server name: cadentrail\nTransport: Streamable HTTP\nURL: " +
      endpoint +
      "\nAuthentication: Bearer token\nUse CADENTRAIL_TOKEN from your private environment, or the client's secure token field.",
    REST: `curl ${JSON.stringify(origin + "/api/integrations/capabilities")} \\\n  -H "Authorization: Bearer $CADENTRAIL_TOKEN"`,
  };
  const operations = Object.entries(reference?.paths ?? {})
    .flatMap(([path, verbs]) =>
      Object.entries(verbs)
        .filter(([method]) =>
          ["get", "post", "put", "patch", "delete"].includes(method),
        )
        .map(([method, op]) => ({
          key: method.toUpperCase() + " " + path,
          path,
          method: method.toUpperCase(),
          op,
        })),
    )
    .filter((x) => !x.path.startsWith("/api/_test"));
  const filtered = operations.filter((x) =>
    (
      x.key +
      " " +
      x.op.summary +
      " " +
      x.op.description +
      " " +
      x.op.tags?.join(" ")
    )
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const active = operations.find((x) => x.key === selected);
  return (
    <Dialog
      className="integrations"
      titleId="integrations-title"
      onClose={close}
    >
      <header className="integration-header">
        <div>
          <span className="eyebrow">
            CADENTRAIL · {caps?.version ?? "INTEGRATIONS"}
          </span>
          <h2 id="integrations-title">API & Integrations</h2>
          <p>Your workstation, connected to your tools.</p>
        </div>
        <div className="integration-header-actions">
          {openAgents && (
            <button
              className="back-to-agents"
              aria-label="Back to Agents"
              onClick={openAgents}
            >
              <Bot size={16} />
              <span>Agents</span>
            </button>
          )}
          <button
            autoFocus
            aria-label="Close API & Integrations"
            onClick={close}
          >
            <X size={20} />
          </button>{" "}
        </div>
      </header>
      <div className="integration-layout">
        <nav aria-label="Integration sections">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setError("");
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
          <small>
            Same projects.
            <br />
            Same generation queue.
            <br />
            Your permissions.
          </small>
        </nav>
        <section
          className="integration-content"
          aria-label={tabs.find((t) => t[0] === tab)?.[1]}
        >
          {error && (
            <div className="integration-error" role="alert">
              {error}{" "}
              <button onClick={() => void refresh()}>Retry loading</button>
            </div>
          )}
          {!loaded && !error && (
            <p role="status">Reading workstation capabilities…</p>
          )}
          {loaded && (
            <>
              {tab === "connect" && (
                <>
                  <h3>Connect your creative assistant</h3>
                  <button
                    className="integration-runpod-link"
                    onClick={() => setTab("runpod")}
                  >
                    <Server size={17} /> Pair with official Runpod skills
                  </button>
                  <p>
                    Let an agent write drafts, generate takes, work with scores,
                    separate stems, master audio and render visuals in your
                    existing projects.
                  </p>
                  <ol className="integration-steps">
                    <li>
                      <strong>Create an access token</strong>
                      <span>
                        Name the connection and choose what it can do.
                      </span>
                      <button onClick={() => setTab("tokens")}>
                        Create token <KeyRound size={14} />
                      </button>
                    </li>
                    <li>
                      <strong>Set CADENTRAIL_TOKEN</strong>
                      <span>
                        Set this environment variable privately on the device
                        running your agent, then restart that client. Keep the
                        token out of project files and prompts.
                      </span>
                    </li>
                    <li>
                      <strong>Add the connection</strong>
                      <span>
                        {client === "Codex"
                          ? "Add this to your Codex config.toml."
                          : client === "Claude Code"
                            ? "Add this to your Claude Code MCP configuration."
                            : client === "Other MCP"
                              ? "Enter these settings in your client's MCP connection form."
                              : "Example for a Bash-compatible shell. Set the token privately first."}
                      </span>
                    </li>
                  </ol>
                  <div
                    className="integration-segments"
                    aria-label="Connection client"
                  >
                    {Object.keys(configs).map((c) => (
                      <button
                        key={c}
                        aria-pressed={client === c}
                        onClick={() => setClient(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <Code text={configs[client]} />
                  <p className="integration-note">
                    Streamable HTTP · Bearer authentication · One application
                    port. This server does not offer an OAuth sign-in flow.
                    Clients must support a configured authorization header.
                  </p>
                  <details>
                    <summary>Connection addresses</summary>
                    <dl>
                      <dt>MCP</dt>
                      <dd>
                        <code>{endpoint}</code>
                      </dd>
                      <dt>OpenAPI</dt>
                      <dd>
                        <a
                          href="/api/openapi.json"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {origin}/api/openapi.json
                        </a>
                      </dd>
                      <dt>Share this page</dt>
                      <dd>
                        <a href="?integrations=1">{origin}/?integrations=1</a>
                      </dd>
                    </dl>
                  </details>
                  <div className="integration-callout">
                    <ShieldCheck size={18} />
                    <p>
                      {caps?.auth.passwordRequired
                        ? "Password protection is on. Agents need a valid token and the permission for each operation."
                        : "This workstation has open access. Tokens restrict authenticated agent requests, but anonymous REST requests still have full access. Set a workstation password to enforce access for everyone."}
                    </p>
                  </div>
                  <p className="integration-links">
                    <a
                      href="https://developers.openai.com/codex/mcp/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Codex setup documentation
                    </a>
                    <a
                      href="https://code.claude.com/docs/en/mcp"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Claude Code setup documentation
                    </a>
                  </p>
                </>
              )}
              {tab === "runpod" && (
                <RunpodIntegration connect={() => setTab("connect")} />
              )}
              {tab === "tokens" && (
                <>
                  <h3>Give each agent its own key</h3>
                  <p>
                    Permissions apply to every project on this workstation.
                    Tokens cannot manage other tokens, remove models or restore
                    workstation backups.
                  </p>
                  {secret && (
                    <div className="integration-secret" role="status">
                      <strong>Save this token now — it is shown once.</strong>
                      <p>
                        {secret.name} · expires {date(secret.expiresAt)}
                      </p>
                      <Code text={secret.token!} label="Copy new agent token" />
                      <div className="integration-actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              const r = await fetch("/api/integrations/me", {
                                headers: {
                                  Authorization: "Bearer " + secret.token,
                                },
                              });
                              if (!r.ok)
                                throw Error(
                                  "Token check failed (" + r.status + ").",
                                );
                              const data = await r.json();
                              setTest(
                                "Connected as " +
                                  data.agent.name +
                                  ". Permissions verified.",
                              );
                            })
                          }
                        >
                          Test connection
                        </button>
                        <button
                          onClick={() => {
                            setSecret(null);
                            setTest("");
                          }}
                        >
                          I saved my token
                        </button>
                      </div>
                      {test && <p>{test}</p>}
                      <small>
                        The token stays only in this open panel. Closing it
                        clears the displayed secret.
                      </small>
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        const created = await post<Token>(
                          "/integrations/tokens",
                          { name, scopes, expiresDays: days },
                        );
                        setSecret(created);
                        setTest("");
                        setName("");
                        setTokens(await api<Token[]>("/integrations/tokens"));
                      });
                    }}
                  >
                    <div className="integration-form-row">
                      <label>
                        Connection name
                        <input
                          required
                          maxLength={80}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="My Codex assistant"
                        />
                      </label>
                      <label>
                        Expires after
                        <select
                          value={days}
                          onChange={(e) => setDays(+e.target.value)}
                        >
                          {[1, 7, 30, 90, 365].map((n) => (
                            <option key={n} value={n}>
                              {n} day{n === 1 ? "" : "s"}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <fieldset>
                      <legend>Permissions</legend>
                      <div className="integration-segments">
                        {Object.entries(presets).map(([label, value]) => (
                          <button
                            type="button"
                            key={label}
                            aria-pressed={
                              JSON.stringify(scopes) === JSON.stringify(value)
                            }
                            onClick={() => setScopes(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {caps?.auth.scopes.map((scope) => (
                        <label className="integration-scope" key={scope.id}>
                          <input
                            type="checkbox"
                            checked={scopes.includes(scope.id)}
                            disabled={scope.id === "read"}
                            onChange={(e) =>
                              setScopes(
                                e.target.checked
                                  ? [...scopes, scope.id]
                                  : scopes.filter((x) => x !== scope.id),
                              )
                            }
                          />
                          <span>
                            <strong>{scope.name}</strong>
                            <small>{scope.description}</small>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <p className="integration-note">
                      Download permission still requires explicit model approval
                      for each request. Jobs already accepted continue if you
                      revoke a token; cancel them from the queue when needed.
                      Changing the workstation password revokes all existing
                      tokens.
                    </p>
                    <button
                      className="primary"
                      disabled={busy || !name.trim() || !!secret}
                    >
                      Create access token
                    </button>
                  </form>
                  <h3 className="integration-subtitle">Your connections</h3>
                  {tokens.length === 0 && <p>No agent tokens yet.</p>}
                  <div className="integration-token-list">
                    {tokens.map((t) => {
                      const ended =
                        t.revokedAt || t.expiresAt < Date.now() / 1000;
                      return (
                        <article key={t.id}>
                          <div>
                            <strong>{t.name}</strong>
                            <small>
                              {t.revokedAt
                                ? "Revoked"
                                : ended
                                  ? "Expired"
                                  : "Expires " + date(t.expiresAt)}{" "}
                              · Last used {date(t.lastUsedAt)}
                            </small>
                            <span>{t.scopes.join(" · ")}</span>
                          </div>
                          {!ended &&
                            (revoke === t.id ? (
                              <div className="integration-actions">
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void action(async () => {
                                      await api(
                                        "/integrations/tokens/" + t.id,
                                        { method: "DELETE" },
                                      );
                                      setRevoke(null);
                                      if (secret?.id === t.id) setSecret(null);
                                      setTokens(
                                        await api<Token[]>(
                                          "/integrations/tokens",
                                        ),
                                      );
                                    })
                                  }
                                >
                                  Confirm revoke
                                </button>
                                <button onClick={() => setRevoke(null)}>
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setRevoke(t.id)}>
                                Revoke
                              </button>
                            ))}
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
              {tab === "reference" && (
                <>
                  <h3>Explore the live API</h3>
                  <p>
                    The reference is generated from this running version.
                    Read-only checks are available here; creative operations use
                    the shared queue.
                  </p>
                  <label className="integration-search">
                    Find an endpoint
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Projects, lyrics, jobs, exports…"
                    />
                  </label>
                  <div className="integration-reference">
                    <div
                      className="integration-endpoints"
                      aria-label="API endpoints"
                    >
                      {filtered.map((x) => (
                        <button
                          key={x.key}
                          aria-current={selected === x.key ? "true" : undefined}
                          onClick={() => setSelected(x.key)}
                        >
                          <b>{x.method}</b>
                          <span>
                            {x.path}
                            <small>{x.op.summary}</small>
                          </span>
                        </button>
                      ))}
                      {!filtered.length && <p>No matching endpoints.</p>}
                    </div>
                    {active && (
                      <article className="integration-endpoint">
                        <h4>{active.op.summary}</h4>
                        <code>{active.key}</code>
                        <p>{active.op.description}</p>
                        <p className="integration-note">
                          Agent scopes:{" "}
                          {active.op["x-agent-scopes"]?.join(", ") ||
                            "see workflow"}
                          . Job permissions also depend on operation and
                          download consent.
                        </p>
                        <details open>
                          <summary>Request contract</summary>
                          <Code
                            label="Copy request schema"
                            text={JSON.stringify(
                              {
                                parameters: active.op.parameters ?? [],
                                body: active.op.requestBody ?? null,
                              },
                              null,
                              2,
                            )}
                          />
                        </details>
                        <details>
                          <summary>Responses</summary>
                          <Code
                            text={JSON.stringify(active.op.responses, null, 2)}
                          />
                        </details>
                      </article>
                    )}
                  </div>
                  <details>
                    <summary>
                      Data schemas · Project, Generation, video and job options
                    </summary>
                    <Code
                      text={JSON.stringify(
                        reference?.components.schemas,
                        null,
                        2,
                      )}
                      label="Copy API data schemas"
                    />
                  </details>
                  <div className="integration-actions">
                    <a
                      href="/api/openapi.json"
                      download="cadentrail-openapi.json"
                    >
                      Download OpenAPI
                    </a>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await api("/integrations/capabilities");
                          setTest(
                            "Read-only API check passed. Your workstation is reachable.",
                          );
                        })
                      }
                    >
                      Check API connection
                    </button>
                  </div>
                  {test && <p role="status">{test}</p>}
                </>
              )}
              {tab === "workflow" && (
                <>
                  <h3>From a request to a finished asset</h3>
                  <p>
                    Agents receive this guide through MCP resources and the
                    create-song workflow prompt.
                  </p>
                  <div className="integration-guide">
                    {guide
                      .split("\n\n")
                      .map((p, i) =>
                        p.startsWith("# ") ? null : <p key={i}>{p}</p>,
                      )}
                  </div>
                  <h4>Model limits remain part of the contract</h4>
                  <ul>
                    {caps?.limits.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <Code
                    label="Copy generation example"
                    text={JSON.stringify(
                      {
                        projectId: "YOUR_PROJECT_ID",
                        kind: "generate",
                        candidates: 1,
                        approvedDownloads: [],
                      },
                      null,
                      2,
                    )}
                  />
                  <p>
                    POST this body to <code>/api/jobs</code> with an{" "}
                    <code>Idempotency-Key</code> of 16–128 letters, digits,
                    underscores or hyphens. Poll{" "}
                    <code>/api/jobs/RETURNED_JOB_ID</code>. Only retry the same
                    submission with the same key.
                  </p>
                </>
              )}
              {tab === "activity" && (
                <>
                  <div className="integration-actions">
                    <h3>Agent activity</h3>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () =>
                          setEvents(
                            await api<EventRow[]>("/integrations/activity"),
                          ),
                        )
                      }
                    >
                      <RefreshCw size={15} />
                      Refresh
                    </button>
                  </div>
                  <p>
                    Recent agent write requests, including denied operations.
                    This log stores the connection name, route, time and status.
                    It does not store prompts, media or tokens.
                  </p>
                  {!events.length && <p>No agent activity yet.</p>}
                  <div className="integration-activity">
                    {events.map((e) => (
                      <article key={e.id}>
                        <span
                          className={
                            e.status >= 400
                              ? "integration-status failed"
                              : "integration-status"
                          }
                        >
                          {e.status}
                        </span>
                        <div>
                          <strong>{e.name}</strong>
                          <code>
                            {e.method} {e.path}
                          </code>
                          <small>{date(e.created)}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </Dialog>
  );
}
