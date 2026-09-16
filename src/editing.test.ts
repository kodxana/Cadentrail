import { describe, it, expect } from "vitest";
import { newClip, newNote } from "./model";
import { splitClip, trimClip, expandedNotes, chordPitches } from "./editing";
import { automationValue } from "./audio";

describe("musical editing preserves source meaning", () => {
  it("splits forward audio without moving its sample boundaries", () => {
    const source = newClip({ assetId: "a", beat: 8, duration: 12, offset: 2 });
    const [a, b] = splitClip(source, 12, 120);
    expect(a.offset).toBe(2);
    expect(b.offset).toBe(4);
    expect(a.duration + b.duration).toBe(source.duration);
    expect(source.duration).toBe(12);
  });
  it("splits reversed audio in the correct source order", () => {
    const source = newClip({
      assetId: "a",
      beat: 8,
      duration: 12,
      offset: 2,
      reverse: true,
    });
    const [a, b] = splitClip(source, 12, 120);
    expect(a.offset).toBe(6);
    expect(b.offset).toBe(2);
    expect(a.offset + a.duration * 0.5).toBe(
      source.offset + source.duration * 0.5,
    );
    expect(b.offset + b.duration * 0.5).toBe(a.offset);
  });
  it("preserves sustained notes across a split and expands repeated patterns", () => {
    const source = newClip({
      duration: 16,
      loop: true,
      loopBeats: 4,
      notes: [newNote(0, 60, 3)],
    });
    const [a, b] = splitClip(source, 6, 120);
    expect(a.loop).toBe(false);
    expect(b.loop).toBe(false);
    expect(a.notes.map((n) => [n.beat, n.duration])).toEqual([
      [0, 3],
      [4, 2],
    ]);
    expect(b.notes.map((n) => [n.beat, n.duration])).toEqual([
      [0, 1],
      [2, 3],
      [6, 3],
    ]);
  });
  it("trims reversed clips without changing the surviving playback samples", () => {
    const source = newClip({
      assetId: "a",
      duration: 12,
      offset: 2,
      reverse: true,
    });
    const a = trimClip(source, "left", 4, 120);
    expect(a.offset).toBe(2);
    expect(a.duration).toBe(8);
    const b = trimClip(source, "right", -4, 120);
    expect(b.offset).toBe(4);
    expect(b.offset + b.duration * 0.5).toBe(
      source.offset + source.duration * 0.5,
    );
  });
  it("does not trim beyond the source start", () => {
    const source = newClip({ assetId: "a", beat: 10, duration: 4, offset: 1 });
    expect(trimClip(source, "left", -8, 120).offset).toBe(0);
    expect(trimClip(source, "left", -8, 120).beat).toBe(8);
  });
  it("interpolates volume and pan consistently at boundary times", () => {
    const p = [
      { beat: 2, value: 0 },
      { beat: 4, value: 1 },
    ];
    expect(automationValue(p, 0, 0.8)).toBe(0);
    expect(automationValue(p, 3, 0.8)).toBe(0.5);
    expect(automationValue(p, 8, 0.8)).toBe(1);
    expect(automationValue(p, 3, 0.8, true)).toBe(0);
  });
  it("auditions musician-readable harmony", () => {
    expect(chordPitches("Cmaj7")).toEqual([48, 52, 55, 59]);
    expect(chordPitches("Dm7")).toEqual([50, 53, 57, 60]);
    expect(chordPitches("F#dim")).toEqual([54, 57, 60]);
    expect(chordPitches("Cm")).toEqual([48, 51, 55]);
  });
});
