import type { Project } from "./model";
import type { LyricTiming, LyricLine, TimedWord } from "./visual-model";
import { makeLyricLines } from "./timing";
export type LyricRange = { start: number; end: number };
export const sameWords = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");
export function validLyricRange(
  value: { start: number | null; end: number | null },
  duration: number,
): value is LyricRange {
  return (
    value.start !== null &&
    value.end !== null &&
    Number.isFinite(value.start) &&
    Number.isFinite(value.end) &&
    value.start >= 0 &&
    value.end > value.start &&
    value.end <= duration + 0.05
  );
}
export function usableWord(
  word: TimedWord,
  timing: LyricTiming,
  line: LyricLine,
  duration: number,
) {
  return (
    validLyricRange(word, duration) &&
    validLyricRange(line, duration) &&
    word.start >= line.start - 0.02 &&
    word.end <= line.end + 0.02 &&
    (!timing.needsReview ||
      word.source === "manual" ||
      word.source === "forced-alignment" ||
      (word.confidence ?? 0) >= 0.5)
  );
}
export function lineRange(
  line: LyricLine,
  timing: LyricTiming,
  duration: number,
): LyricRange | null {
  if (!validLyricRange(line, duration)) return null;
  if (
    !timing.needsReview ||
    line.source === "manual" ||
    (line.confidence ?? 0) >= 0.5
  )
    return { start: line.start, end: line.end };
  const matched =
    line.words.length > 0 &&
    sameWords(line.words.map((w) => w.text).join(" "), line.text) &&
    usableWord(line.words[0], timing, line, duration) &&
    usableWord(line.words.at(-1)!, timing, line, duration);
  return matched ? { start: line.start, end: line.end } : null;
}
export function resolveLiveLyrics(
  project: Project,
  assetIds: string[],
  duration: number,
) {
  let timing: LyricTiming | null = null;
  for (const id of assetIds) {
    // An intentionally cleared current timing must win over an older draft.
    timing =
      project.visuals.timing.assetId === id
        ? project.visuals.timing
        : ([...project.visuals.timingHistory]
            .reverse()
            .find((t) => t.assetId === id) ?? null);
    if (timing) break;
  }
  const lines = timing?.lines.length
    ? timing.lines
    : makeLyricLines(project.generation.lyrics);
  const ranges = lines.map((line) =>
    timing ? lineRange(line, timing, duration) : null,
  );
  return {
    timing,
    lines,
    ranges,
    timedCount: ranges.filter(Boolean).length,
    lyricsChanged:
      !!timing && !sameWords(timing.sourceLyrics, project.generation.lyrics),
  };
}
export function lyricPosition(ranges: (LyricRange | null)[], time: number) {
  const active: number[] = [];
  let anchor = 0,
    latest = -1;
  ranges.forEach((range, index) => {
    if (!range) return;
    if (time >= range.start && time < range.end) active.push(index);
    if (range.start <= time && range.start >= latest) {
      anchor = index;
      latest = range.start;
    }
  });
  return { active, anchor };
}

export function activateSavedTiming(project: Project, assetId: string) {
  if (project.visuals.timing.assetId === assetId) return;
  const chosen = [...project.visuals.timingHistory]
    .reverse()
    .find((t) => t.assetId === assetId);
  if (!chosen) return;
  if (project.visuals.timing.lines.length)
    project.visuals.timingHistory = [
      ...project.visuals.timingHistory,
      project.visuals.timing,
    ].slice(-50);
  project.visuals.timing = structuredClone(chosen);
}
