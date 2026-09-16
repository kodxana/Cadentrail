import { useEffect, useState } from "react";
import { Server, Music2, ArrowUpRight, Download } from "lucide-react";
import { api } from "./api";
import Code from "./IntegrationCode";
import { runpodContext, runpodHandoff, runpodTasks } from "./runpodHandoff";

type Guide = {
  officialSkillsUrl: string;
  installCommand: string;
  mcpSetupCommand: string;
  runpodMcpUrl: string;
  skillPath: string;
  reconnectKitPath: string;
  text: string;
  deployment: {
    image: string;
    cloud: string;
    testedGpu: string;
    httpPort: number;
    volumeMountPath: string;
    env: Record<string, string>;
    healthPath: string;
    note: string;
  };
};
export default function RunpodIntegration({
  connect,
}: {
  connect: () => void;
}) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState("");
  const [task, setTask] = useState(runpodTasks["Reconnect MCP"]);
  const [preset, setPreset] = useState("Reconnect MCP");
  const [workstationId, setWorkstationId] = useState<string>();
  const [client, setClient] = useState("Codex");
  const context = runpodContext(location.origin);
  const load = async () => {
    setError("");
    try {
      const [document, session] = await Promise.all([
        api<Guide>("/integrations/runpod"),
        api<{ workstationId: string }>("/session"),
      ]);
      setGuide(document);
      setWorkstationId(session.workstationId);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <div className="integration-runpod-heading">
        <Server size={27} aria-hidden="true" />
        <div>
          <span className="eyebrow">BUILT FOR RUNPOD</span>
          <h3>A new Pod. The same connection.</h3>
        </div>
      </div>
      <p>
        When a replacement Pod changes your workstation address, the official
        Runpod skills help your agent find it and update the existing Cadentrail
        MCP connection.
      </p>
      <div className="integration-pair">
        <article>
          <Server size={19} />
          <div>
            <strong>Runpod skills + tools</strong>
            <p>Find your current Cadentrail Pod.</p>
          </div>
        </article>
        <article>
          <Music2 size={19} />
          <div>
            <strong>Cadentrail MCP</strong>
            <p>Keep the name. Update the URL. Resume creating.</p>
          </div>
        </article>
      </div>
      {error && (
        <div className="integration-error" role="alert">
          {error}{" "}
          <button onClick={() => void load()}>Retry Runpod guide</button>
        </div>
      )}
      {!guide && !error && <p role="status">Loading Runpod setup…</p>}
      {guide && (
        <>
          <h4>Reconnect your agent</h4>
          <p>
            Copy this request into your agent. Runpod discovery works even when
            the old Cadentrail MCP is offline. The agent may need a reload after
            updating its connection.
          </p>
          <div
            className="integration-segments"
            aria-label="Runpod starter task"
          >
            {Object.entries(runpodTasks).map(([name, value]) => (
              <button
                key={name}
                aria-pressed={preset === name}
                onClick={() => {
                  setPreset(name);
                  setTask(value);
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <label className="integration-request">
            Your request
            <textarea
              rows={4}
              maxLength={4000}
              value={task}
              onChange={(e) => {
                setTask(e.target.value);
                setPreset("");
              }}
            />
          </label>
          <div className="integration-workstation">
            <span>Workstation</span>
            <code>{context.origin}</code>
            <small>
              {context.podId
                ? "Suggested Pod ID: " +
                  context.podId +
                  " · account not verified"
                : "No Pod ID detected · local and custom addresses are supported"}
            </small>
          </div>
          <Code
            text={runpodHandoff(context.origin, task, workstationId)}
            label="Copy agent brief"
          />
          <div className="integration-actions">
            <a
              className="integration-download"
              href={guide.reconnectKitPath}
              download="cadentrail-runpod-reconnect.zip"
            >
              <Download size={15} /> Download reconnect kit
            </a>
          </div>
          <p className="integration-note">
            Includes the skill and this workstation’s persistent identity, with
            no token or songs. Save it in your agent’s skill folder before
            replacing a Pod. The identity lets the agent distinguish your
            installation from other Cadentrail Pods.
          </p>
          <details>
            <summary>Set up Runpod skills and the companion</summary>
            <ol className="integration-steps">
              <li>
                <strong>Install the official Runpod skills</strong>
                <span>
                  On the computer running your agent. Already have the Runpod
                  plugin? Keep your existing installation.
                </span>
                <Code
                  text={guide.installCommand}
                  label="Copy Runpod skills installation"
                />
                <a
                  href={guide.officialSkillsUrl + "#install"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official Runpod installation guide <ArrowUpRight size={13} />
                </a>
                <details>
                  <summary>Connect Runpod tools, if needed</summary>
                  <p>
                    Skills teach the workflow. Runpod MCP executes Pod
                    operations. If your plugin already exposes working Runpod
                    tools, this step is complete. Otherwise use Runpod’s guided
                    setup:
                  </p>
                  <Code
                    text={guide.mcpSetupCommand}
                    label="Copy Runpod MCP setup"
                  />
                  <p>
                    Sign in through the Runpod connection in your agent.
                    Runpod’s hosted MCP address is{" "}
                    <code>{guide.runpodMcpUrl}</code>. CLI workflows may also
                    need <code>RUNPOD_API_KEY</code>.
                  </p>
                </details>
              </li>
              <li>
                <strong>Connect Cadentrail</strong>
                <span>
                  Create a Cadentrail access token and add its MCP connection
                  alongside Runpod.
                </span>
                <button onClick={connect}>
                  Open connection setup <ArrowUpRight size={14} />
                </button>
                <p className="integration-note">
                  Cadentrail uses <code>CADENTRAIL_TOKEN</code>. Runpod uses its
                  own sign-in or <code>RUNPOD_API_KEY</code>. Each credential
                  stays with its own service.
                </p>
              </li>
              <li>
                <strong>Add the companion skill</strong>
                <span>
                  A small, reusable guide by Madiator2011 that teaches the
                  handoff, shared projects and YuE2 limitations.
                </span>
                <div className="integration-actions">
                  <a
                    className="integration-download"
                    href={guide.skillPath}
                    download="SKILL.md"
                  >
                    <Download size={15} /> Download SKILL.md
                  </a>
                </div>
                <details>
                  <summary>Where to save it</summary>
                  <div
                    className="integration-segments"
                    aria-label="Skill client"
                  >
                    {["Codex", "Claude Code"].map((c) => (
                      <button
                        key={c}
                        aria-pressed={client === c}
                        onClick={() => setClient(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <p>
                    Create the <code>cadentrail-runpod</code> folder and save
                    the download there as <code>SKILL.md</code>. For the
                    reconnect kit, extract the whole{" "}
                    <code>cadentrail-runpod</code> folder into the skills
                    directory, keeping its <code>references</code> folder:
                  </p>
                  <Code
                    text={
                      client === "Codex"
                        ? "~/.agents/skills/cadentrail-runpod/SKILL.md"
                        : "~/.claude/skills/cadentrail-runpod/SKILL.md"
                    }
                    label="Copy companion skill location"
                  />
                  <p>
                    <code>~</code> means your user home folder. Reload the agent
                    if the new skill does not appear. The standalone skill has
                    reusable instructions. The reconnect kit also remembers the
                    workstation identity; neither includes credentials or
                    lyrics.
                  </p>
                  <a
                    href={
                      client === "Codex"
                        ? "https://developers.openai.com/codex/skills/"
                        : "https://code.claude.com/docs/en/skills"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {client} skill documentation
                  </a>
                </details>
                <details>
                  <summary>Preview companion skill</summary>
                  <Code text={guide.text} label="Copy companion skill" />
                </details>
              </li>
            </ol>
          </details>
          <details>
            <summary>Deployment reference for agents</summary>
            <p>{guide.deployment.note}</p>
            <Code
              text={JSON.stringify(guide.deployment, null, 2)}
              label="Copy deployment reference"
            />
            <p>
              The agent can also call <code>get_runpod_guide</code> or read{" "}
              <code>cadentrail://runpod</code>. These only return guidance; they
              do not connect to your Runpod account.
            </p>
          </details>
          <p className="integration-runpod-credit">
            Cadentrail · A DAW for YuE2
            <br />
            Created by Madiator2011 · Built for Runpod
            <br />
            <a href={guide.officialSkillsUrl} target="_blank" rel="noreferrer">
              Discover the official Runpod skills <ArrowUpRight size={12} />
            </a>
          </p>
        </>
      )}
    </>
  );
}
