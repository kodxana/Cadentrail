import {
  newClip,
  newTrack,
  palette,
  type Note,
  type Project,
  type Track,
} from "./model";

export type MidiImportResult = {
  tracks: {
    name: string;
    notes: Note[];
    instrument: Track["instrument"];
    channel: number;
    program: number;
  }[];
  tempo: number;
  timeSignature: [number, number];
  warnings: string[];
};
export type PendingMidi = {
  projectId: string;
  fileName: string;
  cursor: number;
  result: MidiImportResult;
};
export function canUseMidiTiming(result: MidiImportResult) {
  return (
    result.tempo >= 20 &&
    result.tempo <= 400 &&
    result.timeSignature[0] >= 1 &&
    result.timeSignature[0] <= 32 &&
    [2, 4, 8, 16].includes(result.timeSignature[1])
  );
}
export function hasArrangement(project: Project) {
  return (
    project.tracks.some((t) =>
      t.clips.some((c) => c.assetId || c.notes.length),
    ) ||
    project.chords.length > 0 ||
    project.sections.length > 0
  );
}
export function importedMidiTracks(pending: PendingMidi, trackCount: number) {
  return pending.result.tracks.map((part, index) => {
    const color = palette[(trackCount + index) % palette.length];
    return newTrack({
      type: "midi",
      name: part.name,
      instrument: part.instrument,
      color,
      clips: [
        newClip({
          name: pending.fileName.slice(0, 180),
          beat: pending.cursor,
          color,
          duration: part.notes.reduce(
            (end, n) => Math.max(end, n.beat + n.duration),
            4,
          ),
          notes: part.notes,
        }),
      ],
    });
  });
}
