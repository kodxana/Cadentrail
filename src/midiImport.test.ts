import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { newClip, newNote, newTrack, type Project } from "./model";
import {
  canUseMidiTiming,
  hasArrangement,
  type PendingMidi,
} from "./midiImport";
import {
  confirmMidiImport,
  getState,
  importFile,
  setState,
  undo,
} from "./store";
import { fileApi } from "./api";
vi.mock("./api", () => ({ fileApi: vi.fn(), api: vi.fn(), post: vi.fn() }));
const pending = (): PendingMidi => ({
  projectId: "p",
  fileName: "reference.mid",
  cursor: 8,
  result: {
    tempo: 200,
    timeSignature: [6, 8],
    warnings: [],
    tracks: [
      {
        name: "Lead · Ch 4",
        channel: 3,
        program: 80,
        instrument: "poly",
        notes: [newNote(0, 72, 2)],
      },
      {
        name: "Drums",
        channel: 9,
        program: 0,
        instrument: "drums",
        notes: [{ ...newNote(0, 36, 1), channel: 9 }],
      },
    ],
  },
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  setState({
    project: {
      id: "p",
      tempo: 120,
      timeSignature: [4, 4],
      tracks: [newTrack({ clips: [newClip()] })],
      chords: [],
      sections: [],
      generation: { abc: "saved reference", useScore: true },
    } as unknown as Project,
    pendingMidi: pending(),
    selectedClips: ["old"],
    selectedNotes: ["old-note"],
    undo: [],
    redo: [],
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it("imports every part, selects the imported clip, adopts timing explicitly and undoes the whole import", () => {
  const original = getState().project!;
  expect(hasArrangement(original)).toBe(false);
  confirmMidiImport(true);
  const next = getState();
  expect(next.project!.tempo).toBe(200);
  expect(next.project!.timeSignature).toEqual([6, 8]);
  expect(next.project!.tracks).toHaveLength(3);
  expect(next.selectedClips).toEqual([next.project!.tracks[1].clips[0].id]);
  expect(next.selectedTrack).toBe(next.project!.tracks[1].id);
  expect(next.selectedNotes).toEqual([]);
  expect(next.project!.tracks[1].clips[0].beat).toBe(8);
  expect(next.project!.generation).toEqual(original.generation);
  expect(next.project!.tracks[2].instrument).toBe("drums");
  undo();
  expect(getState().project).toEqual(original);
});
it("keeps existing timing and prevents applying a pending import to another project", () => {
  confirmMidiImport(false);
  expect(getState().project!.tempo).toBe(120);
  expect(getState().project!.timeSignature).toEqual([4, 4]);
  const original = getState().project;
  setState({ pendingMidi: { ...pending(), projectId: "other" } });
  confirmMidiImport(true);
  expect(getState().project).toBe(original);
});
it("rejects unsupported project timing instead of silently clamping it", () => {
  const next = pending();
  next.result.tempo = 500;
  expect(canUseMidiTiming(next.result)).toBe(false);
  setState({ pendingMidi: next });
  expect(() => confirmMidiImport(true)).toThrow(/supported range/);
  expect(getState().project!.tracks).toHaveLength(1);
});
it("drops a late import response after changing projects", async () => {
  let finish!: (v: unknown) => void;
  vi.mocked(fileApi).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as any,
  );
  const work = importFile({ name: "reference.mid" } as File);
  setState({
    project: { ...getState().project!, id: "other" },
    pendingMidi: null,
  });
  finish(pending().result);
  await work;
  expect(getState().pendingMidi).toBeNull();
  expect(getState().project!.tracks).toHaveLength(1);
});
