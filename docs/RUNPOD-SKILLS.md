# Cadentrail + official Runpod skills

Cadentrail is an independent DAW for YuE2, created by Madiator2011 and built for Runpod. The [official Runpod plugin](https://github.com/runpod/runpod-plugins-official) teaches agents to work with GPU infrastructure; Cadentrail's MCP connection works with music projects. Install both in the same agent for a connected workflow.

## Reconnect MCP after a Pod replacement

The MCP connection name stays stable (normally cadentrail); its URL contains the changing Pod ID. The primary workflow uses the separate official Runpod skills/tools to discover the current Pod, match the persistent workstation identity, then update only the URL in the agent's existing MCP configuration. Token settings, scope, timeouts and unrelated servers stay intact.

Download the **reconnect kit** and extract cadentrail-runpod into the agent's skills directory. Keep its references/connection.json file: it records this workstation's persistent identity without credentials or a stale Pod address. It lets the local skill work even when the old endpoint is offline. The standalone SKILL.md remains available for generic use.

The agent lists account-owned Cadentrail Pods, probes /health and /api/session without credentials or redirects and requires a unique identity match before reusing credentials. Multiple matches require selection. Fresh storage means a new identity and typically a new token; the workflow must not quietly connect to a different workstation. A stopped Pod needs a separate decision to start paid compute.

After updating the existing entry, the agent reconnects and verifies MCP initialize, tools/list and get_capabilities. Clients may require a reload; the browser cannot edit another application's MCP settings or promise a hot reconnect. This is a skill-driven repair workflow, not a background DNS or proxy service.

## Setup

1. Open **API & Integrations → Runpod**, or /?integrations=runpod.
2. Install the official Runpod skills in the environment running your agent. The official cross-client command is: npx skills add runpod/runpod-plugins-official. Existing Runpod plugin users can keep their installation.
3. Connect Runpod MCP if not already available. The official guided installer is: npx @runpod/mcp-server@latest add. Follow its authentication steps. Skills alone are not an authenticated tool connection. See [Runpod installation and authentication](https://github.com/runpod/runpod-plugins-official#install).
4. In Cadentrail's **Connect** section, create a scoped token and configure Cadentrail MCP. Set CADENTRAIL_TOKEN privately in the agent environment. This is separate from Runpod OAuth or RUNPOD_API_KEY. Never interchange credentials.
5. Download SKILL.md into a folder named cadentrail-runpod in your agent's skills directory. [Codex](https://developers.openai.com/codex/skills/) uses ~/.agents/skills/cadentrail-runpod/SKILL.md; [Claude Code](https://code.claude.com/docs/en/skills) uses ~/.claude/skills/cadentrail-runpod/SKILL.md. Reload the agent if needed.
6. Choose and edit a starter task, then copy its brief into your agent. The default requests connection repair, without starting or replacing a Pod. Copying or downloading does not execute a task or install software.

The source skill is backend/skills/cadentrail-runpod/SKILL.md. The application serves this same file; no duplicate guide is maintained. It is also readable through get_runpod_guide and cadentrail://runpod.

## What the handoff carries

The brief includes the browser's public origin and MCP URL. Only an exact Runpod port-8000 proxy hostname produces a suggested Pod ID. The label is unverified until checked against the user's Runpod account. Localhost and custom domains stay usable without an inferred Pod. The brief includes the persistent workstation ID needed to recognize a replacement Pod. No project content, browser query/hash, cookie or token is included automatically. Users can edit their own request before copying.

The skill keeps creative work in existing projects and queues, respects revision conflicts and explicit model-download consent and routes requested maintenance to the official Runpod skills. Availability, price, storage capacity and image digest must be checked when actually deploying. It cannot discover whether an agent has Runpod installed from inside the browser.

Runpod setup commands and installation paths were checked against the linked primary documentation on 2026-09-16. The official skill content remains maintained by Runpod; Cadentrail supplies its own companion instructions rather than vendoring that plugin.
