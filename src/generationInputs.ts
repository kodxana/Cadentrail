import type { Candidate, Generation } from "./model";
import { instrumentalDirection } from "./generationPresentation";

export const generationScope =
  "YuE2 creates a new complete take. Per-track AI rendering and replacement of a selected audio region are not supported.";
export const previewInstrumentHint =
  "Built-in synth for Studio playback and audio export. This does not select YuE2’s instruments.";
export const scoreGuidanceHint =
  "ABC guides composition. YuE2 may change notes, phrasing, instrumentation and timing.";
export const scoreUseLabel = "Use saved ABC for next take";

export function generationInputIssue(
  g: Generation,
  operation: "generate" | "plan" = "generate",
): string | null {
  if (g.useScore && g.hum)
    return "Choose one melody reference: detach the hum or turn off Use saved ABC for next take.";
  if (g.useScore && !g.abc.trim())
    return "The enabled ABC reference is empty. Add a score or turn off Use saved ABC for next take.";
  if (g.useScore && g.cot === "off")
    return "The enabled ABC reference needs score planning. Select Melody only or Melody + chords, or turn off Use saved ABC for next take.";
  if (operation === "plan" && g.cot === "off" && !g.hum)
    return "Score planning is off. Choose Melody only or Melody + chords to create a score.";
  return null;
}
export function generationInputSummary(g: Generation) {
  const issue = generationInputIssue(g),
    score = g.useScore && !issue;
  const reference = issue
    ? "Reference needs attention"
    : score
      ? "Saved ABC reference"
      : g.hum
        ? "Hummed melody"
        : g.abc.trim()
          ? "Saved ABC is off"
          : "No melody reference";
  const words = !instrumentalDirection(g)
    ? "lyrics and vocal direction"
    : g.musicAdapter === "base"
      ? "a no-vocals style request; saved lyrics are excluded"
      : "instrumental section tags; saved lyrics are excluded";
  return { issue, score, reference, words };
}
export function generationFromCandidate(
  current: Generation,
  candidate: Pick<Candidate, "abc" | "metadata">,
): Generation {
  const source = candidate.metadata.generation as
    Partial<Generation> | undefined;
  const next = { ...current, ...source };
  if (candidate.abc) {
    next.abc = candidate.abc;
    // Hum preparation supplies its own score. Do not attach a second reference.
    next.useScore = !next.hum && next.cot !== "off";
  }
  return next;
}
