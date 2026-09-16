import { describe, expect, it } from "vitest";
import { audibleTracks, sameStructure, validateRouting } from "./routing";
import { newTrack, type Project } from "./model";
describe("bus routing", () => {
  const fixture = () => [
    newTrack({ id: "a", output: "group" }),
    newTrack({ id: "b", output: "group" }),
    newTrack({ id: "group", type: "bus", output: "outer" }),
    newTrack({ id: "outer", type: "bus" }),
    newTrack({ id: "c" }),
  ];
  it("solo opens only the soloed channel and its ancestors", () => {
    const t = fixture();
    t[0].solo = true;
    expect([...audibleTracks(t)].sort()).toEqual(["a", "group", "outer"]);
  });
  it("soloing a bus opens descendants through nested buses", () => {
    const t = fixture();
    t[3].solo = true;
    expect([...audibleTracks(t)].sort()).toEqual(["a", "b", "group", "outer"]);
  });
  it("mute wins over solo", () => {
    const t = fixture();
    t[0].solo = true;
    t[0].mute = true;
    expect(audibleTracks(t).has("a")).toBe(false);
  });
  it("rejects feedback before constructing a Web Audio graph", () => {
    const t = fixture();
    t[3].output = "group";
    expect(() => validateRouting(t)).toThrow("feedback");
  });
  it("fader edits keep the existing graph, clip edits rebuild it", () => {
    const a = { id: "p", tempo: 120, tracks: fixture() } as Project;
    const b = { ...a, tracks: a.tracks.map((t) => ({ ...t, volume: 0.5 })) };
    expect(sameStructure(a, b)).toBe(true);
    b.tracks[0].clips = [...a.tracks[0].clips];
    expect(sameStructure(a, b)).toBe(false);
  });
});
