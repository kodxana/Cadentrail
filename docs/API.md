# Cadentrail API & Integrations — 0.4.11

Open **API & Integrations** (the code-brackets button) in Creation, Listen or Radio. A direct link is `/?integrations=1`. The page includes connection setup, token management, the running API reference, an agent workflow guide and recent write activity. It uses the existing workstation design on desktop and phones.

## Connections

REST base: your workstation origin plus `/api`. OpenAPI: `/api/openapi.json`. MCP: `/api/mcp` on the same application port. MCP uses stateless Streamable HTTP and a configured `Authorization: Bearer …` header. No OAuth server or extra service/container is required. It negotiates the 2025-11-25, 2025-06-18 and 2025-03-26 protocol revisions; newer clients can negotiate one of these supported revisions. The official Python MCP 2.2.0 client has been tested with automatic negotiation.

Create a named token in the app and set `CADENTRAIL_TOKEN` privately in the environment of the agent process. Restart the agent after changing its environment. The token appears once; the server stores only its SHA-256 hash. Do not paste it into an AI prompt, URL, project, source file or shared configuration.

Codex configuration (replace the example URL; the app generates yours):

```toml
[mcp_servers.cadentrail]
url = "https://YOUR-POD-8000.proxy.runpod.net/api/mcp"
bearer_token_env_var = "CADENTRAIL_TOKEN"
tool_timeout_sec = 60
```

This uses [Codex's configured Bearer environment variable](https://developers.openai.com/codex/mcp/). No `codex mcp login` flow is provided by Cadentrail.

Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "cadentrail": {
      "type": "http",
      "url": "https://YOUR-POD-8000.proxy.runpod.net/api/mcp",
      "headers": {"Authorization": "Bearer ${CADENTRAIL_TOKEN}"}
    }
  }
}
```

Claude Code [expands environment variables in MCP headers](https://code.claude.com/docs/en/mcp). Other clients need support for configured HTTP authorization headers. This is not an OAuth connector for clients that require OAuth exclusively.

## Permissions

| Scope | Capability |
|---|---|
| `read` | All projects, lyrics, files, media, jobs and capabilities; included with every token |
| `projects:write` | Project creation/editing, imports, duplication, revision restoration, organization |
| `generation:run` | YuE2 music/score generation and lyric/style/arrangement assistance |
| `audio:process` | Stems, timing alignment, real-audio encoding, mastering, export |
| `visuals:render` | Artwork, covers, videos and automatic video pipelines |
| `jobs:manage` | Cancel/reprioritize/retry any job; retry also needs its original operation permission |
| `models:download` | Optional downloads, with explicit approved model IDs in each request |
| `radio:manage` | Start, retune, stop or retry the shared station and edit station recipes |

These are operation permissions across the workstation, not per-project sharing or separate user accounts. Agent tokens cannot administer credentials, remove models, restore workstation backups, or create backup jobs. Browser-authenticated access retains those owner operations. Unsupported/new write routes deny agent access until classified.

**Open access remains the default.** Anonymous REST clients can still use an open workstation. Scoped tokens restrict requests that present them; configure `DAW_PASSWORD` to enforce authentication for everyone. Invalid Bearer headers never fall back to open access or a browser cookie. MCP always requires a token. Foreign browser origins are rejected, including on MCP GET requests.

Tokens expire after 1, 7, 30, 90 or 365 days. At most 32 active tokens are allowed. Revocation is checked on every request. Tokens survive restarts on the same persistent volume and password; a password change revokes all existing tokens. Accepted jobs continue after token revocation or client disconnection—cancel them explicitly if desired. The browser session WebSocket remains cookie-authenticated; agents poll job status.

Activity retains up to 2,000 recent agent write requests (the page shows the latest 100): token identity/name, timestamp, method, route and HTTP status. It does not store prompts, response bodies, query strings, tokens or media. Jobs carry their initiating agent name in the normal queue.

## Agent tools and workflow

37 MCP tools cover project creation/read/save, generation edits, revisions, assets/files/library, model/provider/GPU status, job submission/progress/cancel/retry, music and score planning, writing assistance, artwork, stems, alignment, mastering, covers, video timelines, automatic music videos, real-audio encoding and live Radio. Advanced `submit_job` exposes the existing typed JobRequest contract. Server mix export uses `kind: "export"`; browser-only mixes fail clearly rather than silently losing effects.

Resources: `cadentrail://guide`, `cadentrail://capabilities`, `cadentrail://openapi`. The `create-song` MCP prompt includes the workflow and takes a `request` argument. Read the guide before creative operations.

1. Read capabilities/models and find or create a project. A creation `requestId` makes a lost reply safe to retry.
2. Read the current Project. Generation edits require its revision and the complete edited Generation object. Copy unedited fields; the route preserves arrangement, visuals and history. Full Project saves require preserving all fields. A stale revision returns **409**; reload and reconcile.
3. Queue writing assistance with explicit language, or `auto` for description inference. The result is a draft under `creative.lyricDrafts`; it does not silently become accepted lyrics. Instrumental projects use `enhance` or `arrange` instead of lyric generation.
4. Queue music with 1/2/4/8 candidates and a unique `requestId`. The tool returns a job immediately. Poll `get_job` every 2–5 seconds, backing off on connection failures. Terminal states are Complete, Failed and Cancelled.
5. If **428** reports missing models, show the exact names and sizes to the user. Only after approval resend the same submission with those IDs in `approvedDownloads`. The token must also permit `models:download`.
6. After completion, read candidate IDs and named project files. Use the same Bearer header for artifact URLs on this workstation. Original audio, derived masters, timing, scores, artwork and video stay linked to the project.

REST jobs accept `Idempotency-Key` (16–128 letters, digits, `_` or `-`). Reuse it after an ambiguous response to an identical submission. Use a new key for new creative work or a deliberate retry. Keys are isolated per agent token. Project creation also accepts this header. The full JSON body limit for agents is 4 MiB; existing media-upload limits remain in force.

Example request body for `POST /api/jobs`, after the project's generation settings are prepared:

```json
{"projectId":"YOUR_PROJECT_ID","kind":"generate","candidates":1,"approvedDownloads":[]}
```

Read the returned job at `GET /api/jobs/JOB_ID`. `GET /api/projects/PROJECT_ID/files` lists named artifacts with download URLs. `GET /api/integrations/me` verifies the token and current scopes without starting work.

## Limits

YuE2 duration depends on composition. More acoustic steps are more effort, not guaranteed better quality. Lyrics/score/style revision makes a new whole-song take; it is not sample-accurate inpainting. Instrumental adaptation is supported; occasional vocal artifacts can remain. Duet casting and sung-language accuracy are not deterministic. Hum-to-Song is experimental. Alignment may require manual correction.

Full workstation instrument synthesis, bus routing, some effects and automation require browser rendering. Browser playback, microphone recording and MIDI device access are not headless agent tools. Radio is a shared, ephemeral session; inspect it and get the user's direction before changing another listener's station. It continues until explicitly stopped.

Optional models and their licenses still apply. The API does not bypass hardware, provider, file ownership or model validation. No new runtime dependencies or model layers are required by this integration.


## Official Runpod skills

Visit /?integrations=runpod for the official Runpod installation links, companion skill download and an editable agent brief. Runpod tools manage infrastructure through a separate connection; Cadentrail never receives a Runpod account credential.

- get_runpod_guide / GET /api/integrations/runpod: deployment defaults, official setup links and companion instructions.
- cadentrail://runpod: the same document as an MCP resource.
- GET /api/integrations/runpod/SKILL.md: portable skill download.

These are read-only and use the existing authentication rules. No infrastructure action is executed by these endpoints. See [Runpod skills setup](RUNPOD-SKILLS.md).

The Runpod section defaults to reconnecting the existing Cadentrail MCP entry after its Pod address changes. GET /api/integrations/runpod/reconnect.zip downloads the skill plus references/connection.json containing the persistent workstation ID, connection name and port/path defaults. It excludes tokens and project data and requires the same access as other integration reads. /api/session already exposes the persistent workstationId for unauthenticated identity probes before credential reuse. Pod candidates must also come from the user's authenticated Runpod account; the public ID alone is not proof of account ownership.

## User-facing agent guide

Agents is a separate visible entry in Creation, Listen and Radio. Its setup buttons target the existing Connect and Access tokens screens, with a Back to Agents button preserving the selected client and task draft. Developers can continue to open /?integrations=1 directly; users can open /?agents=1.

The guide copies a task request for the user's external agent. It does not host an in-app chat or automatically send a message. Current-project requests contain the project ID/name, not embedded media or lyrics; unsaved project edits must be saved before copying. My connections reports token usage metadata and recent agent-attributed jobs without claiming live online presence.
