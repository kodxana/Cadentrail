import { it, expect } from "vitest";
import { makeLyricLines, mergeLine, splitLine } from "./timing";
import { newVisuals } from "./visual-model";
import { lineRange, usableWord, lyricPosition } from "./liveLyrics";
import { voiceName } from "./lyricRoles";
it("preserves authored duet roles without mistaking plain lyric words for tags", () => {
  const lines = makeLyricLines(
    "[Verse - Male]\nI am here\nFemale: Are you there\n[Chorus]\nBoth: Carry me home\nA beautiful day",
  );
  expect(lines.map((l) => l.voice)).toEqual(["a", "b", "together", null]);
  expect(lines[3].text).toBe("A beautiful day");
});
it("splits preserve voices and merging cannot erase the second singer", () => {
  const t = newVisuals().timing;
  t.lines = makeLyricLines("A: Here we are\nB: Far away");
  expect(() => mergeLine(t, 0)).toThrow("same voice");
  splitLine(t, 0, 1);
  expect(t.lines.map((l) => l.voice)).toEqual(["a", "a", "b"]);
});
it("highlights real forced-alignment boundaries without fabricating confidence", () => {
  const t = newVisuals().timing,
    l = makeLyricLines("One word")[0];
  l.start = 1;
  l.end = 3;
  l.source = "forced-alignment";
  l.words.forEach((w, i) => {
    w.start = 1 + i;
    w.end = 2 + i;
    w.source = "forced-alignment";
  });
  expect(lineRange(l, t, 10)).toEqual({ start: 1, end: 3 });
  expect(usableWord(l.words[0], t, l, 10)).toBe(true);
  l.words[1].start = null;
  l.words[1].end = null;
  expect(lineRange(l, t, 10)).toBeNull();
});
it("overlapping duet lines remain active together and voice names have safe defaults", () => {
  expect(
    lyricPosition(
      [
        { start: 1, end: 4 },
        { start: 2, end: 5 },
      ],
      3,
    ).active,
  ).toEqual([0, 1]);
  const t = newVisuals().timing;
  t.voices = [{ id: "b", name: "Guest" }];
  expect(voiceName("b", t)).toBe("Guest");
  expect(voiceName("a", t)).toBe("Voice A");
  expect(voiceName("together", t)).toBe("Together");
});

it("keeps a partially aligned line in sync while its unknown middle word stays unhighlighted", () => {
  const t = newVisuals().timing,
    l = makeLyricLines("hold the light")[0];
  l.start = 1;
  l.end = 4;
  l.source = "forced-alignment";
  for (const i of [0, 2]) {
    l.words[i].start = 1 + i;
    l.words[i].end = 2 + i;
    l.words[i].source = "forced-alignment";
  }
  expect(lineRange(l, t, 10)).toEqual({ start: 1, end: 4 });
  expect(usableWord(l.words[1], t, l, 10)).toBe(false);
  expect(l.words[1].start).toBeNull();
});
