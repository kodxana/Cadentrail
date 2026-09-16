import { headingVoice, lineVoice, type Voice } from "./lyricRoles";
import { id } from "./model";
import type { LyricLine, LyricTiming } from "./visual-model";
export function makeLyricLines(text: string): LyricLine[] {
  let section = "";
  let voice: Voice | null = null;
  const lines: LyricLine[] = [];
  for (const raw of text.split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    if (/^\[[^\]]+\]$/.test(line)) {
      section = line.slice(1, -1);
      voice = headingVoice(section);
      continue;
    }
    const parsed = lineVoice(line),
      role = parsed.voice ?? voice;
    line = parsed.text;
    lines.push({
      voice: role,
      voiceSource: role ? "lyrics" : null,
      voiceConfidence: null,
      id: id(),
      text: line,
      section,
      start: null,
      end: null,
      confidence: null,
      source: "manual",
      words: line.split(/\s+/).map((text) => ({
        id: id(),
        text,
        start: null,
        end: null,
        confidence: null,
        source: "manual",
      })),
    });
  }
  return lines;
}
export function nudgeLine(line: LyricLine, delta: number) {
  if (line.start === null || line.end === null) return;
  const shift = Math.max(-line.start, delta);
  line.start += shift;
  line.end += shift;
  line.source = "manual";
  for (const w of line.words)
    if (w.start !== null && w.end !== null) {
      w.start += shift;
      w.end += shift;
      w.source = "manual";
    }
}
export function setLineBoundary(
  line: LyricLine,
  key: "start" | "end",
  value: number,
) {
  value = Math.max(0, value);
  if (key === "start") {
    if (line.end !== null && value >= line.end)
      throw new Error("Start must be before the line end.");
    line.start = value;
    if (line.end === null) line.end = value + 2;
  } else {
    if (line.start !== null && value <= line.start)
      throw new Error("End must be after the line start.");
    line.end = value;
    if (line.start === null) line.start = Math.max(0, value - 2);
  }
  line.source = "manual";
  for (const w of line.words)
    if (w.start !== null && (w.start < line.start! || w.end! > line.end!)) {
      w.start = w.end = null;
      w.source = "manual";
    }
}
export function splitLine(
  timing: LyricTiming,
  index: number,
  wordIndex: number,
) {
  const line = timing.lines[index];
  if (!line || wordIndex < 1 || wordIndex >= line.words.length) return;
  const first = line.words.slice(0, wordIndex),
    second = line.words.slice(wordIndex);
  const a = {
    ...line,
    words: first,
    text: first.map((w) => w.text).join(" "),
    end: first.at(-1)?.end ?? null,
  };
  const b = {
    ...line,
    id: id(),
    words: second,
    text: second.map((w) => w.text).join(" "),
    start: second[0].start,
  };
  if (a.end === null) a.start = null;
  if (b.start === null) b.end = null;
  timing.lines.splice(index, 1, a, b);
  timing.needsReview = true;
}
export function mergeLine(timing: LyricTiming, index: number) {
  const a = timing.lines[index],
    b = timing.lines[index + 1];
  if (!a || !b) return;
  if ((a.voice ?? null) !== (b.voice ?? null))
    throw new Error("Assign the same voice to both lines before merging.");
  if (a.end !== null && b.start !== null && a.end > b.start)
    throw new Error("Correct the overlapping lines before merging.");
  a.text += " " + b.text;
  a.words.push(...b.words);
  a.end = b.end;
  if (a.start === null || a.end === null) a.start = a.end = null;
  timing.lines.splice(index + 1, 1);
  timing.needsReview = true;
}
