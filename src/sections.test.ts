import { it, expect } from "vitest";
import { duplicateSection } from "./Sections";
import { newTrack, newClip, type Project } from "./model";
it("section insertion preserves source offsets and shifts later content", () => {
  const p = {
    tempo: 120,
    loopEnd: 16,
    sections: [
      { id: "v", name: "Verse", beat: 4, duration: 4, lyrics: "A line" },
    ],
    chords: [],
    tracks: [
      newTrack({
        clips: [newClip({ id: "audio", assetId: "a", duration: 16 })],
      }),
    ],
  } as unknown as Project;
  duplicateSection(p, "v");
  expect(p.loopEnd).toBe(20);
  const clips = p.tracks[0].clips.sort((a, b) => a.beat - b.beat);
  expect(clips.map((c) => [c.beat, c.duration, c.offset])).toEqual([
    [0, 8, 0],
    [8, 4, 2],
    [12, 8, 4],
  ]);
  expect(p.sections[1]).toMatchObject({ beat: 8, lyrics: "A line" });
});
