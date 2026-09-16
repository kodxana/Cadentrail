import { it, expect } from "vitest";
import { playbackWindows, wrappedBeat } from "./transport";
it("schedules both sides of a loop boundary against one continuous clock", () => {
  const w = playbackWindows(15, 0, 4, 16, true, 3);
  expect(w).toEqual([
    { epoch: 0, start: 0, end: 16, beat: 15, horizon: 16, offset: 0 },
    { epoch: 1, start: 4, end: 16, beat: 4, horizon: 6, offset: 16 },
  ]);
  expect(wrappedBeat(17, 4, 16, true)).toBe(5);
});
it("seeking into the middle of a loop preserves subsequent loop timing", () => {
  const w = playbackWindows(27, 8, 4, 16, true, 2);
  expect(w[0]).toMatchObject({
    epoch: 1,
    start: 4,
    beat: 15,
    horizon: 16,
    offset: 8,
  });
  expect(w[1]).toMatchObject({
    epoch: 2,
    start: 4,
    beat: 4,
    horizon: 5,
    offset: 20,
  });
});
it("rejects pathological sub-sample loop regions", () => {
  expect(() => playbackWindows(0, 0, 0, 1e-8, true, 12)).toThrow();
});
