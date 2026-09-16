import type { Project } from "./model";
export type RecoveryDraft = {
  key: string;
  project: Project;
  base: Project | null;
  savedAt: number;
};
let workspace = "local";
let tab =
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
export function recoveryWorkspace(value: string) {
  workspace = value;
}
const prefix = (id: string) => `cadentrail:recovery:${workspace}:${id}:`;
export function persistDraft(
  project: Project,
  base: Project | null,
): string | null {
  try {
    if (typeof localStorage === "undefined")
      return "Browser recovery storage is unavailable. Keep this tab open until your project saves.";
    localStorage.setItem(
      prefix(project.id) + tab,
      JSON.stringify({ version: 1, project, base, savedAt: Date.now() }),
    );
    return null;
  } catch {
    return "Browser recovery storage is full or unavailable. Download a recovery copy before closing this tab.";
  }
}
export function removeDraft(key: string) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
export function clearOwnDraft(id: string) {
  return removeDraft(prefix(id) + tab);
}
export function recoveryDrafts(id: string): RecoveryDraft[] {
  try {
    const found: RecoveryDraft[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix(id))) continue;
      try {
        const d = JSON.parse(localStorage.getItem(key) || "null");
        if (
          d?.version === 1 &&
          d.project?.id === id &&
          Array.isArray(d.project.tracks) &&
          Number.isFinite(d.savedAt) &&
          (!d.base || d.base.id === id)
        )
          found.push({
            key,
            project: d.project,
            base: d.base,
            savedAt: d.savedAt,
          });
      } catch {
        /* A malformed entry must not prevent opening the server project. */
      }
    }
    return found.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}
