/** Only public connection context belongs in a copied agent brief. */
export function runpodContext(address: string) {
  const url = new URL(address);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use a public HTTP or HTTPS workstation address.");
  const podId =
    url.hostname.match(/^([a-z0-9]{10,32})-8000\.proxy\.runpod\.net$/)?.[1] ??
    null;
  return { origin: url.origin, endpoint: url.origin + "/api/mcp", podId };
}
export const runpodTasks = {
  "Reconnect MCP":
    "Use the official Runpod skills to find my current Cadentrail Pod and repair my existing Cadentrail MCP connection if its URL changed. Verify the workstation identity first, preserve the connection name and token settings, update only its URL, and reconnect and test MCP. Do not start or replace a Pod.",
  "Check workstation":
    "Check this workstation's GPU readiness, installed models, queue and Radio status. Summarize anything that needs attention. Keep this diagnostic read-only.",
  "Create music":
    "Help me create a song in Cadentrail. First establish the musical direction, lyric language and whether to use a new or existing project. Check capabilities and models, then use the shared queue for the agreed creative work.",
  "Prepare exports":
    "Help me prepare deliverables from a Cadentrail project. Let me select the project and source take, inspect its mix and available export operations, then produce the agreed exports while preserving originals.",
};
export function runpodHandoff(
  address: string,
  task: string,
  workstationId?: string,
) {
  const { origin, endpoint, podId } = runpodContext(address);
  return [
    "Use the cadentrail-runpod companion skill, if installed.",
    "For any requested Pod infrastructure work, use the official Runpod skills and relevant examples: https://github.com/runpod/runpod-plugins-official",
    "",
    "Last known Cadentrail workstation (may become stale): " + origin,
    "Last known Cadentrail MCP: " + endpoint,
    ...(workstationId && /^[a-f0-9]{32}$/.test(workstationId)
      ? ["Expected persistent workstation ID: " + workstationId]
      : []),
    "Keep the existing Cadentrail MCP entry name (normally cadentrail). A new Pod changes its URL, not that connection name.",
    "If this address is unreachable, use the separate Runpod connection to list/get my Pods, verify the Cadentrail image and port 8000, then compare public /health and /api/session workstationId before sending any Cadentrail token.",
    "Only a unique matching workstation can be selected automatically; ask me if several match or storage identity changed. Update only the existing entry URL, preserve auth/settings, then reconnect and verify MCP initialize, tools/list and get_capabilities.",
    podId
      ? "Pod ID suggested by proxy hostname: " +
        podId +
        " (verify in my Runpod account before changes)."
      : "Pod ID is unknown from this address. Ask only if infrastructure work requires it.",
    "Once connected, read get_capabilities and get_runpod_guide (or cadentrail://guide and cadentrail://runpod). The local reconnect kit remains usable while the old MCP is offline.",
    "Use the configured CADENTRAIL_TOKEN privately for this workstation. Runpod uses its separate OAuth connection or RUNPOD_API_KEY; keep credentials with their own service.",
    "Respect existing project revisions, running jobs, Radio and model-download consent. Do not provision, stop, restart or delete a Pod unless that action is part of my request.",
    "",
    "My request:",
    task.trim(),
  ].join("\n");
}
