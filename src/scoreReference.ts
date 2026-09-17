import { expandedNotes } from "./editing";
import type { Clip, Project, Track } from "./model";

export function melodySources(project: Project) {
  return project.tracks.flatMap((track) =>
    track.clips
      .filter((clip) => !clip.assetId && clip.notes.length > 0)
      .map((clip) => ({ track, clip })),
  );
}

/** A score reference is an explicit snapshot of one clip, never the whole mix. */
export function scoreReference(
  project: Project,
  track: Track,
  clip: Clip,
  range: "clip" | "loop",
  harmony: boolean,
) {
  if (clip.assetId || track.instrument === "drums")
    throw new Error("Choose a pitched melody, not audio or a drum kit.");
  const start =
    range === "loop" ? Math.max(clip.beat, project.loopStart) : clip.beat;
  const end =
    range === "loop"
      ? Math.min(clip.beat + clip.duration, project.loopEnd)
      : clip.beat + clip.duration;
  const notes = expandedNotes(clip)
    .filter((n) => n.channel !== 9)
    .flatMap((n) => {
      const from = Math.max(start, clip.beat + n.beat);
      const to = Math.min(end, clip.beat + n.beat + n.duration);
      return to > from
        ? [{ ...n, beat: from - start, duration: to - from }]
        : [];
    })
    .sort((a, b) => a.beat - b.beat || a.pitch - b.pitch);
  if (!notes.length)
    throw new Error(
      "No pitched notes in this range. Choose another clip or range.",
    );
  const chords = harmony
    ? project.chords.flatMap((c) => {
        const from = Math.max(start, c.beat),
          to = Math.min(end, c.beat + c.duration);
        return to > from
          ? [{ ...c, beat: from - start, duration: to - from }]
          : [];
      })
    : [];
  let soundingUntil = -1,
    polyphonic = false;
  for (const n of notes) {
    if (n.beat < soundingUntil - 1e-7) polyphonic = true;
    soundingUntil = Math.max(soundingUntil, n.beat + n.duration);
  }
  return {
    notes,
    chords,
    tempo: project.tempo,
    timeSignature: project.timeSignature,
    title: `${project.name} · ${track.name}`,
    polyphonic,
    seconds: ((end - start) * 60) / project.tempo,
    excludedDrums: clip.notes.some((n) => n.channel === 9),
  };
}
