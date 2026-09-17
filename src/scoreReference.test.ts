import { expect, it } from "vitest";
import { newClip, newNote, newTrack, type Project } from "./model";
import { scoreReference } from "./scoreReference";

function fixture() {
  const clip = newClip({
    beat: 16,
    duration: 8,
    notes: [newNote(1, 72, 3), newNote(5, 74, 2)],
  });
  const track = newTrack({ type: "midi", clips: [clip] });
  const project = {
    name: "Song",
    tempo: 200,
    timeSignature: [4, 4],
    loopStart: 18,
    loopEnd: 22,
    tracks: [
      track,
      newTrack({ clips: [newClip({ notes: [newNote(0, 30)] })] }),
    ],
    chords: [
      { id: "a", beat: 16, duration: 4, symbol: "C" },
      { id: "b", beat: 20, duration: 4, symbol: "G" },
      { id: "outside", beat: 30, duration: 4, symbol: "F" },
    ],
  } as Project;
  return { project, track, clip };
}
it("clips notes and global chords to the same loop origin without including other tracks", () => {
  const { project, track, clip } = fixture(),
    original = structuredClone(project);
  const r = scoreReference(project, track, clip, "loop", true);
  expect(r.notes.map((n) => [n.pitch, n.beat, n.duration])).toEqual([
    [72, 0, 2],
    [74, 3, 1],
  ]);
  expect(r.chords.map((c) => [c.symbol, c.beat, c.duration])).toEqual([
    ["C", 0, 2],
    ["G", 2, 2],
  ]);
  expect(r.tempo).toBe(200);
  expect(project).toEqual(original);
});
it("melody-only removes chord symbols, retains rests and flags overlapping voices", () => {
  const { project, track, clip } = fixture();
  clip.notes.push(newNote(1, 67, 1));
  const r = scoreReference(project, track, clip, "clip", false);
  expect(r.chords).toEqual([]);
  expect(r.notes).toHaveLength(3);
  expect(r.notes[0].beat).toBe(1);
  expect(r.polyphonic).toBe(true);
});
it("expands repeats and excludes percussion from legacy clips with several channels", () => {
  const { project, track, clip } = fixture();
  clip.notes = [newNote(0, 72, 1), { ...newNote(0, 36, 1), channel: 9 }];
  clip.loop = true;
  clip.loopBeats = 2;
  clip.duration = 6;
  const r = scoreReference(project, track, clip, "clip", false);
  expect(r.notes.map((n) => [n.pitch, n.beat])).toEqual([
    [72, 0],
    [72, 2],
    [72, 4],
  ]);
  expect(r.excludedDrums).toBe(true);
});
it("rejects audio, drum tracks and ranges without notes", () => {
  const { project, track, clip } = fixture();
  expect(() =>
    scoreReference(
      project,
      { ...track, instrument: "drums" },
      clip,
      "clip",
      false,
    ),
  ).toThrow(/pitched/);
  expect(() =>
    scoreReference(
      project,
      track,
      { ...clip, assetId: "audio" },
      "clip",
      false,
    ),
  ).toThrow(/pitched/);
  project.loopStart = 0;
  project.loopEnd = 4;
  expect(() => scoreReference(project, track, clip, "loop", false)).toThrow(
    /No pitched notes/,
  );
});
