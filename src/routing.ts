import type { Track, Project } from "./model";

export function validateRouting(tracks: Track[]) {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  for (const track of tracks) {
    const seen = new Set([track.id]);
    let output = track.output;
    while (output !== "master") {
      if (seen.has(output))
        throw new Error("Track routing contains a feedback cycle");
      seen.add(output);
      const parent = byId.get(output);
      if (!parent || parent.type !== "bus")
        throw new Error("Track output must be an existing bus or Master");
      output = parent.output;
    }
  }
}

/** Solo opens descendants of explicitly soloed buses and the path to Master.
 * Opening an ancestor must not accidentally open its other children. */
export function audibleTracks(tracks: Track[]): Set<string> {
  validateRouting(tracks);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const solo = new Set(tracks.filter((t) => t.solo).map((t) => t.id));
  if (!solo.size)
    return new Set(tracks.filter((t) => !t.mute).map((t) => t.id));
  const active = new Set(solo);
  for (const t of tracks) {
    let output = t.output;
    while (output !== "master") {
      if (solo.has(output)) active.add(t.id);
      output = byId.get(output)!.output;
    }
  }
  for (const tid of [...active]) {
    let output = byId.get(tid)!.output;
    while (output !== "master") {
      active.add(output);
      output = byId.get(output)!.output;
    }
  }
  for (const t of tracks) if (t.mute) active.delete(t.id);
  return active;
}

export function sameStructure(a: Project | null, b: Project): boolean {
  return (
    !!a &&
    a.id === b.id &&
    a.tempo === b.tempo &&
    a.loopStart === b.loopStart &&
    a.loopEnd === b.loopEnd &&
    a.tracks.length === b.tracks.length &&
    a.tracks.every((t, i) => {
      const u = b.tracks[i];
      return (
        t.id === u.id &&
        t.output === u.output &&
        t.instrument === u.instrument &&
        t.clips === u.clips &&
        t.effects === u.effects
      );
    })
  );
}
