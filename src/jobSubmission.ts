// Keep an uncertain submission identity across reloads without storing lyrics or prompts.
const storageKey = "cadentrail:pending-submissions";
let memory: Record<string, string> = {};
function read() {
  try {
    return {
      ...memory,
      ...JSON.parse(localStorage.getItem(storageKey) || "{}"),
    };
  } catch {
    return memory;
  }
}
function persist(value: Record<string, string>) {
  memory = value;
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {}
}
export async function submissionKey(path: string, body: string) {
  const payload = JSON.parse(body);
  delete payload.approvedDownloads;
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  const bytes = new TextEncoder().encode(
    path + JSON.stringify(canonical(payload)),
  );
  if (!globalThis.crypto?.subtle)
    return {
      fingerprint: "",
      key:
        globalThis.crypto?.randomUUID?.() ||
        "job_" + Date.now() + Math.random().toString(36).slice(2),
    };
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const pending = read();
  const key = pending[hash] || crypto.randomUUID();
  pending[hash] = key;
  persist(pending);
  return { fingerprint: hash, key };
}
export function finishSubmission(fingerprint: string) {
  if (!fingerprint) return;
  const p = read();
  delete p[fingerprint];
  persist(p);
}
