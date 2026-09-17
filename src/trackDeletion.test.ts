import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newClip, newNote, newTrack, type Project } from "./model";
import { deleteTrack, getState, redo, setState, undo } from "./store";
import { validateRouting } from "./routing";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  setState({
    selectedTrack: null,
    selectedClips: [],
    selectedNotes: [],
    undo: [],
    redo: [],
    dirty: false,
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("deletes the requested row and its edits, retains source media and supports undo/redo", () => {
  const note = newNote();
  const clip = newClip({ assetId: "source-audio", notes: [note] });
  const removed = newTrack({
    clips: [clip],
    effects: [
      { id: "gain", type: "gain", bypass: false, params: { gain: 0.5 } },
    ],
  });
  const kept = newTrack({ clips: [newClip({ assetId: "source-audio" })] });
  const project = {
    id: "project",
    revision: 3,
    updatedAt: 1,
    tracks: [removed, kept],
    candidates: [{ assetId: "source-audio" }],
  } as Project;
  const assets = [{ id: "source-audio" }] as any;
  setState({
    project,
    assets,
    selectedTrack: removed.id,
    selectedClips: [clip.id, kept.clips[0].id],
    selectedNotes: [note.id],
  });
  deleteTrack(removed.id);
  expect(getState().project?.tracks).toEqual([kept]);
  expect(getState().selectedTrack).toBe(kept.id);
  expect(getState().selectedClips).toEqual([kept.clips[0].id]);
  expect(getState().selectedNotes).toEqual([]);
  expect(getState().assets).toBe(assets);
  expect(getState().project?.candidates).toEqual(project.candidates);
  undo();
  expect(getState().project).toEqual(project);
  redo();
  expect(getState().project?.tracks).toEqual([kept]);
});

it("reconnects children to the deleted bus's parent and restores routing with Undo", () => {
  const outer = newTrack({ type: "bus" });
  const bus = newTrack({ type: "bus", output: outer.id });
  const child = newTrack({ output: bus.id });
  setState({
    project: { id: "p", tracks: [child, bus, outer] } as Project,
    selectedTrack: child.id,
  });
  deleteTrack(bus.id);
  expect(getState().project!.tracks[0].output).toBe(outer.id);
  expect(() => validateRouting(getState().project!.tracks)).not.toThrow();
  expect(getState().selectedTrack).toBe(child.id);
  undo();
  expect(getState().project!.tracks).toEqual([child, bus, outer]);
});

it("can delete the last empty track and ignores stale menu targets", () => {
  const track = newTrack();
  setState({
    project: { id: "p", tracks: [track] } as Project,
    selectedTrack: track.id,
  });
  deleteTrack(track.id);
  expect(getState().project!.tracks).toEqual([]);
  expect(getState().selectedTrack).toBeNull();
  deleteTrack(track.id);
  expect(getState().undo).toHaveLength(1);
  undo();
  expect(getState().project!.tracks).toEqual([track]);
});
