export const tourIds = [
  "home",
  "create",
  "studio",
  "visuals",
  "listen",
  "radio",
] as const;
export type TourId = (typeof tourIds)[number];
export type TourProgress = { step: number; state: "paused" | "complete" };
export type HelpProgress = {
  article: string;
  tours: Partial<Record<TourId, TourProgress>>;
};
const key = "cadentrail:help:v1";
let memory: HelpProgress = { article: "start", tours: {} };

export function readHelpProgress(
  storage?: Pick<Storage, "getItem">,
): HelpProgress {
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(key) ?? "null");
    if (!value || typeof value !== "object")
      return { article: "start", tours: {} };
    const tours: HelpProgress["tours"] = {};
    for (const id of tourIds) {
      const p = value.tours?.[id];
      if (
        p &&
        Number.isInteger(p.step) &&
        p.step >= 0 &&
        p.step < 30 &&
        ["paused", "complete"].includes(p.state)
      )
        tours[id] = { step: p.step, state: p.state };
    }
    return {
      article:
        typeof value.article === "string"
          ? value.article.slice(0, 80)
          : "start",
      tours,
    };
  } catch {
    return memory;
  }
}

export function writeHelpProgress(
  value: HelpProgress,
  storage?: Pick<Storage, "setItem">,
) {
  memory = value;
  try {
    (storage ?? localStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* The handbook and tours still work for this visit. */
  }
}
