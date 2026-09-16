import { it, expect } from "vitest";
import type { Project } from "./model";
import { newVisuals, type LyricLine } from "./visual-model";
import { makeLyricLines } from "./timing";
import {
  activateSavedTiming,
  resolveLiveLyrics,
  lyricPosition,
  lineRange,
  usableWord,
  sameWords,
} from "./liveLyrics";
const line = (text: string, start: number | null, end: number | null) => ({
  ...makeLyricLines(text)[0],
  start,
  end,
});
const project = () =>
  ({
    generation: { lyrics: "First line\nSecond line" },
    visuals: newVisuals(),
  }) as Project;
it("uses this take's historical timing instead of another take's current timing", () => {
  const p = project();
  p.visuals.timing = {
    ...newVisuals().timing,
    assetId: "other",
    lines: [line("Wrong take", 2, 4)],
  };
  p.visuals.timingHistory = [
    { ...newVisuals().timing, assetId: "a", lines: [line("Old", 1, 2)] },
    { ...newVisuals().timing, assetId: "a", lines: [line("Latest", 4, 6)] },
  ];
  expect(resolveLiveLyrics(p, ["a"], 20).lines[0].text).toBe("Latest");
});
it("does not resurrect history after current timing was deliberately cleared", () => {
  const p = project();
  p.visuals.timing.assetId = "a";
  p.visuals.timingHistory = [
    { ...newVisuals().timing, assetId: "a", lines: [line("Old", 1, 2)] },
  ];
  const result = resolveLiveLyrics(p, ["a"], 20);
  expect(result.lines[0].text).toBe("First line");
  expect(result.timedCount).toBe(0);
});
it("keeps untimed lyrics visible without borrowing another recording's timestamps", () => {
  const p = project();
  p.visuals.timing = {
    ...newVisuals().timing,
    assetId: "other",
    lines: [line("Other song", 1, 2)],
  };
  expect(resolveLiveLyrics(p, ["a"], 20).ranges).toEqual([null, null]);
});
it("prefers a master's own timing, then only the explicitly supplied source chain", () => {
  const p = project();
  p.visuals.timing = {
    ...newVisuals().timing,
    assetId: "original",
    lines: [line("Source lyrics", 1, 3)],
  };
  expect(resolveLiveLyrics(p, ["master", "original"], 20).timing?.assetId).toBe(
    "original",
  );
  p.visuals.timingHistory = [
    {
      ...newVisuals().timing,
      assetId: "master",
      lines: [line("Master correction", 2, 5)],
    },
  ];
  expect(resolveLiveLyrics(p, ["master", "original"], 20).lines[0].text).toBe(
    "Master correction",
  );
});
it("highlights only measured intervals and clears highlights in gaps or after the last line", () => {
  const ranges = [{ start: 2, end: 4 }, null, { start: 8, end: 10 }];
  expect(lyricPosition(ranges, 1).active).toEqual([]);
  expect(lyricPosition(ranges, 2).active).toEqual([0]);
  expect(lyricPosition(ranges, 4).active).toEqual([]);
  expect(lyricPosition(ranges, 9)).toEqual({ active: [2], anchor: 2 });
  expect(lyricPosition(ranges, 11).active).toEqual([]);
  expect(lyricPosition(ranges, 3).anchor).toBe(0);
});
it("supports overlapping duet lines without fabricating a combined interval", () => {
  expect(
    lyricPosition(
      [
        { start: 2, end: 6 },
        { start: 4, end: 8 },
      ],
      5,
    ),
  ).toEqual({ active: [0, 1], anchor: 1 });
});
it("rejects out-of-range timestamps and low-confidence automatic words", () => {
  const t = newVisuals().timing,
    l = line("Hello world", 1, 3);
  l.source = "transcription-match";
  l.words = l.words.map((w, i) => ({
    ...w,
    start: 1 + i,
    end: 2 + i,
    confidence: i ? 0.2 : 0.9,
    source: "transcription-match",
  }));
  expect(lineRange(l, t, 20)).toBeNull();
  expect(usableWord(l.words[1], t, l, 20)).toBe(false);
  l.words[1].confidence = 0.9;
  expect(lineRange(l, t, 20)).toEqual({ start: 1, end: 3 });
  expect(lineRange(l, t, 2)).toBeNull();
});
it("honors manual corrections and reviewed timing without requiring model confidence", () => {
  const t = newVisuals().timing,
    l = line("Corrected line", 1, 3);
  expect(lineRange(l, t, 20)).toEqual({ start: 1, end: 3 });
  l.source = "transcription-match";
  t.needsReview = false;
  expect(lineRange(l, t, 20)).toEqual({ start: 1, end: 3 });
});
it("preserves recording lyrics when the project has newer drafts and does not render mismatched word text", () => {
  const p = project();
  p.visuals.timing = {
    ...newVisuals().timing,
    assetId: "a",
    sourceLyrics: "Recorded words",
    lines: [line("Recorded words", 1, 3)],
  };
  const result = resolveLiveLyrics(p, ["a"], 20);
  expect(result.lines[0].text).toBe("Recorded words");
  expect(result.lyricsChanged).toBe(true);
  expect(sameWords("Recorded words", "New lyrics")).toBe(false);
});

it("opening a historical timing for correction preserves the current timing and the older source", () => {
  const p = project();
  p.visuals.timing = {
    ...newVisuals().timing,
    assetId: "a",
    lines: [line("Current", 1, 3)],
  };
  const history = {
    ...newVisuals().timing,
    assetId: "b",
    lines: [line("Other take", 4, 6)],
  };
  p.visuals.timingHistory = [history];
  activateSavedTiming(p, "b");
  expect(p.visuals.timing.assetId).toBe("b");
  expect(p.visuals.timingHistory.at(-1)?.assetId).toBe("a");
  p.visuals.timing.lines[0].start = 5;
  expect(history.lines[0].start).toBe(4);
  activateSavedTiming(p, "missing");
  expect(p.visuals.timing.lines[0].start).toBe(5);
});
