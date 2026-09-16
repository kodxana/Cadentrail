import { it, expect } from "vitest";
import {
  makeLyricLines,
  nudgeLine,
  setLineBoundary,
  splitLine,
  mergeLine,
} from "./timing";
import { newVisuals } from "./visual-model";
it("manual line timing and nudges preserve measured word offsets", () => {
  const l = makeLyricLines("we are here")[0];
  setLineBoundary(l, "start", 2);
  setLineBoundary(l, "end", 5);
  l.words[0].start = 2;
  l.words[0].end = 3;
  nudgeLine(l, 0.5);
  expect(l.words[0].start).toBe(2.5);
  expect(l.end).toBe(5.5);
  setLineBoundary(l, "start", 3);
  expect(l.words[0].start).toBeNull();
});
it("splitting an unaligned line leaves timing blank rather than guessing", () => {
  const t = newVisuals().timing;
  t.lines = makeLyricLines("one two three four");
  splitLine(t, 0, 2);
  expect(t.lines.map((l) => l.start)).toEqual([null, null]);
  expect(t.lines.map((l) => l.text)).toEqual(["one two", "three four"]);
  mergeLine(t, 0);
  expect(t.lines[0].text).toBe("one two three four");
});
