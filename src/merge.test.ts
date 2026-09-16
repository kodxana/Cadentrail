import { describe, it, expect } from "vitest";
import { mergeChanges } from "./merge";
describe("background result merge", () => {
  it("preserves a remote track reorder alongside a local level change", () => {
    const base = [
      { id: "a", volume: 0.8 },
      { id: "b", volume: 0.8 },
    ];
    expect(
      mergeChanges(
        base,
        [{ id: "a", volume: 0.4 }, base[1]],
        [base[1], base[0]],
      ),
    ).toEqual([base[1], { id: "a", volume: 0.4 }]);
  });
  it("preserves a local mix edit while a worker adds artwork and a lyric draft", () => {
    const base = {
      revision: 1,
      tracks: [{ id: "t", volume: 0.8 }],
      visuals: { assets: [] },
      creative: { lyricDrafts: [] },
    };
    const local = { ...base, tracks: [{ id: "t", volume: 0.4 }] };
    const remote = {
      ...base,
      revision: 2,
      visuals: { assets: [{ id: "art", path: "visuals/a.png" }] },
      creative: { lyricDrafts: [{ id: "draft", text: "Song" }] },
    };
    expect(mergeChanges(base, local, remote)).toEqual({
      ...remote,
      tracks: local.tracks,
    });
  });
  it("rejects conflicting timing edits instead of flattening them", () => {
    expect(() =>
      mergeChanges({ start: 1 }, { start: 2 }, { start: 3 }),
    ).toThrow("Concurrent edits");
  });
});
