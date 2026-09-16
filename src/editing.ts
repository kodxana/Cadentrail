import { type Clip, type Note, id, clamp } from "./model";

/** Resolve loop notes before destructive-looking edits; original clip stays in undo history. */
export function expandedNotes(clip: Clip): Note[] {
  const notes: Note[] = [];
  for (
    let repeat = 0;
    repeat < (clip.loop ? Math.ceil(clip.duration / clip.loopBeats) : 1);
    repeat++
  ) {
    for (const n of clip.notes) {
      const beat = n.beat + repeat * clip.loopBeats;
      if (beat < clip.duration)
        notes.push({
          ...n,
          id: repeat ? n.id + ":repeat:" + repeat : n.id,
          beat,
          duration: Math.min(n.duration, clip.duration - beat),
        });
    }
  }
  return notes;
}
export function splitClip(
  original: Clip,
  at: number,
  tempo: number,
): [Clip, Clip] {
  const delta = at - original.beat;
  if (delta <= 0 || delta >= original.duration)
    throw new Error("Split point must be inside the clip");
  const left = structuredClone(original),
    right = structuredClone(original),
    notes = expandedNotes(original);
  left.duration = delta;
  left.fadeOut = 0;
  left.fadeIn = Math.min(left.fadeIn, delta);
  right.id = id();
  right.beat = at;
  right.duration = original.duration - delta;
  right.fadeIn = 0;
  right.fadeOut = Math.min(right.fadeOut, right.duration);
  if (original.assetId) {
    if (original.reverse) {
      left.offset = original.offset + (right.duration * 60) / tempo;
      right.offset = original.offset;
    } else right.offset = original.offset + (delta * 60) / tempo;
  } else {
    left.loop = right.loop = false;
    left.notes = notes
      .filter((n) => n.beat < delta)
      .map((n) => ({ ...n, duration: Math.min(n.duration, delta - n.beat) }));
    right.notes = notes
      .filter((n) => n.beat + n.duration > delta)
      .map((n) => ({
        ...n,
        id: id(),
        beat: Math.max(0, n.beat - delta),
        duration: n.duration - Math.max(0, delta - n.beat),
      }));
  }
  return [left, right];
}
export function trimClip(
  original: Clip,
  edge: "left" | "right",
  delta: number,
  tempo: number,
  minimum = 0.125,
): Clip {
  const c = structuredClone(original),
    bps = tempo / 60;
  if (edge === "left") {
    const min =
      original.assetId && !original.reverse
        ? -Math.min(original.beat, original.offset * bps)
        : -original.beat;
    const change = clamp(delta, min, original.duration - minimum);
    c.beat += change;
    c.duration -= change;
    if (c.assetId) {
      if (!c.reverse) c.offset += change / bps;
    } else {
      c.loop = false;
      c.notes = expandedNotes(original)
        .filter((n) => n.beat + n.duration > change)
        .map((n) => ({
          ...n,
          beat: Math.max(0, n.beat - change),
          duration: n.duration - Math.max(0, change - n.beat),
        }));
    }
  } else {
    const change =
      original.reverse && original.assetId
        ? Math.min(delta, original.offset * bps)
        : delta;
    c.duration = Math.max(minimum, original.duration + change);
    if (c.assetId && c.reverse)
      c.offset = original.offset + (original.duration - c.duration) / bps;
  }
  c.fadeIn = Math.min(c.fadeIn, c.duration);
  c.fadeOut = Math.min(c.fadeOut, c.duration);
  return c;
}
export function chordPitches(symbol: string): number[] {
  const match = symbol.match(/^([A-G])([#b]?)([^/]*)(?:\/([A-G][#b]?))?$/);
  if (!match)
    throw new Error("Use a chord name such as C, Dm7, F#dim or Cmaj7");
  const roots: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const root =
      roots[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0),
    kind = match[3];
  let intervals = /dim|°/.test(kind)
    ? [0, 3, 6]
    : /aug|\+/.test(kind)
      ? [0, 4, 8]
      : /sus2/.test(kind)
        ? [0, 2, 7]
        : /sus4|sus/.test(kind)
          ? [0, 5, 7]
          : /^m(?!aj)/.test(kind)
            ? [0, 3, 7]
            : [0, 4, 7];
  if (/7|9|11|13/.test(kind))
    intervals.push(/maj/.test(kind) ? 11 : /dim/.test(kind) ? 9 : 10);
  if (/9|11|13/.test(kind)) intervals.push(14);
  if (/11|13/.test(kind)) intervals.push(17);
  if (/13/.test(kind)) intervals.push(21);
  if (/b5/.test(kind)) intervals = intervals.map((v) => (v === 7 ? 6 : v));
  const result = intervals.map((i) => 48 + root + i);
  if (match[4]) {
    const bass = match[4];
    result.unshift(
      36 + roots[bass[0]] + (bass[1] === "#" ? 1 : bass[1] === "b" ? -1 : 0),
    );
  }
  return result;
}
export function transposeChord(symbol: string, semitones: number) {
  const pc: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const names = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  return symbol.replace(
    /(^|\/)([A-G])([#b]?)/g,
    (_, prefix, root, accidental) =>
      prefix +
      names[
        (((pc[root] +
          (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) +
          semitones) %
          12) +
          12) %
          12
      ],
  );
}
