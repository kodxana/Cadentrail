import {
  advanceAuthentication,
  errorStatus,
  staleAuthenticationError,
} from "./authErrors";
import {
  persistDraft,
  recoveryDrafts,
  removeDraft,
  clearOwnDraft,
  type RecoveryDraft,
} from "./recovery";
import { splitClip } from "./editing";
import {
  canUseMidiTiming,
  importedMidiTracks,
  type MidiImportResult,
  type PendingMidi,
} from "./midiImport";
import { mergeChanges } from "./merge";
import { measured } from "./performance";
import { useSyncExternalStore } from "react";
import {
  enablePatches,
  produceWithPatches,
  applyPatches,
  produce,
  type Patch,
} from "immer";
import { api, post, fileApi } from "./api";
import {
  type Project,
  type Asset,
  type Job,
  type Track,
  type Clip,
  type Note,
  newTrack,
  newClip,
  id,
  palette,
} from "./model";
enablePatches();
type Command = { label: string; forward: Patch[]; inverse: Patch[] };
type State = {
  pendingMidi: PendingMidi | null;
  listening: boolean;
  radio: boolean;
  project: Project | null;
  assets: Asset[];
  jobs: Job[];
  view:
    | "home"
    | "create"
    | "arrange"
    | "score"
    | "notation"
    | "mix"
    | "analyze"
    | "visuals";
  visualsTab: "artwork" | "cover" | "timing" | "video" | "assets";
  timingSourceAssetId: string | null;
  selectedTrack: string | null;
  selectedClips: string[];
  selectedNotes: string[];
  cursor: number;
  playing: boolean;
  loop: boolean;
  metronome: boolean;
  recovery: { draft: RecoveryDraft; server: Project; conflict: boolean } | null;
  recoveryError: string | null;
  dirty: boolean;
  saveState: string;
  error: string | null;
  errorStatus: number | null;
  notice: string | null;
  undo: Command[];
  redo: Command[];
  zoom: number;
  scroll: number;
  grid: number;
  snap: boolean;
  status: Record<string, unknown>;
  busy: string | null;
};
let state: State = {
  pendingMidi: null,
  radio: (() => {
    try {
      return localStorage.getItem("cadentrail:mode") === "radio";
    } catch {
      return false;
    }
  })(),
  listening: (() => {
    try {
      return localStorage.getItem("cadentrail:mode") === "listen";
    } catch {
      return false;
    }
  })(),
  project: null,
  assets: [],
  jobs: [],
  view: "home",
  visualsTab: "artwork",
  timingSourceAssetId: null,
  selectedTrack: null,
  selectedClips: [],
  selectedNotes: [],
  cursor: 0,
  playing: false,
  loop: false,
  metronome: false,
  recovery: null,
  recoveryError: null,
  dirty: false,
  saveState: "Saved",
  error: null,
  errorStatus: null,
  notice: null,
  undo: [],
  redo: [],
  zoom: 48,
  scroll: 0,
  grid: 0.25,
  snap: true,
  status: {},
  busy: null,
};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null,
  saving: Promise<void> | null = null,
  base: Project | null = null,
  gesture: Project | null = null;
let openRequest = 0;
const clipBoard: { clips: { clip: Clip; trackId: string }[]; notes: Note[] } = {
  clips: [],
  notes: [],
};
export const getState = () => state;
export function setState(next: Partial<State>) {
  if ("project" in next && next.project?.id !== state.project?.id)
    next = {
      ...next,
      pendingMidi:
        next.pendingMidi?.projectId === next.project?.id
          ? (next.pendingMidi ?? null)
          : null,
    };
  if (next.listening !== undefined && next.radio === undefined)
    next = { ...next, radio: false };
  if (next.listening !== undefined || next.radio !== undefined) {
    try {
      localStorage.setItem(
        "cadentrail:mode",
        next.radio ? "radio" : next.listening ? "listen" : "creation",
      );
    } catch {}
  }
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
export const useStudio = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
export function acceptAuthenticatedSession() {
  advanceAuthentication();
  if (state.errorStatus === 401) setState({ error: null, errorStatus: null });
}
export function report(error: unknown) {
  if (staleAuthenticationError(error)) return;
  if (error instanceof Error && error.name === "DownloadCancelled") {
    setState({ busy: null });
    return;
  }
  setState({
    error: error instanceof Error ? error.message : String(error),
    errorStatus: errorStatus(error),
    busy: null,
  });
}
export function notice(message: string) {
  setState({ notice: message });
  setTimeout(() => {
    if (state.notice === message) setState({ notice: null });
  }, 7000);
}
export function protectUnsavedEdits() {
  if (state.project && (state.dirty || gesture))
    setState({ recoveryError: persistDraft(state.project, base) });
}
function changed() {
  setState({ dirty: true, saveState: "Unsaved" });
  protectUnsavedEdits();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void save(), 800);
}
export function edit(label: string, fn: (p: Project) => void) {
  if (!state.project) return;
  const [project, forward, inverse] = produceWithPatches(state.project, fn);
  if (!forward.length) return;
  setState({
    project,
    undo: [...state.undo.slice(-199), { label, forward, inverse }],
    redo: [],
  });
  changed();
}
export function beginGesture() {
  gesture = state.project;
}
export function preview(fn: (p: Project) => void) {
  if (!gesture) return;
  setState({ project: produce(gesture, fn) });
}
export function finishGesture(label: string) {
  if (!gesture || !state.project) return;
  const current = state.project;
  const previous = gesture;
  gesture = null;
  const [project, forward, inverse] = produceWithPatches(previous, (draft) => {
    for (const key of Object.keys(previous) as (keyof Project)[]) {
      if (key === "revision" || key === "updatedAt") continue;
      if (previous[key] !== current[key]) (draft as any)[key] = current[key];
    }
  });
  if (forward.length) {
    setState({
      project,
      undo: [...state.undo.slice(-199), { label, forward, inverse }],
      redo: [],
    });
    changed();
  }
}
export function undo() {
  const cmd = state.undo.at(-1);
  if (!cmd || !state.project) return;
  setState({
    project: {
      ...applyPatches(state.project, cmd.inverse),
      revision: state.project.revision,
      updatedAt: state.project.updatedAt,
    },
    undo: state.undo.slice(0, -1),
    redo: [...state.redo, cmd],
  });
  changed();
}
export function redo() {
  const cmd = state.redo.at(-1);
  if (!cmd || !state.project) return;
  setState({
    project: {
      ...applyPatches(state.project, cmd.forward),
      revision: state.project.revision,
      updatedAt: state.project.updatedAt,
    },
    undo: [...state.undo, cmd],
    redo: state.redo.slice(0, -1),
  });
  changed();
}
function equivalent(a: Project, b: Project) {
  const clean = (p: Project) => {
    const { revision, updatedAt, candidates, ...rest } = p;
    return rest;
  };
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}
export async function save() {
  if (saving) return saving;
  if (!state.project || !state.dirty || state.recovery) return;
  if (gesture) {
    timer = setTimeout(() => void save(), 800);
    return;
  }
  const snapshot = state.project;
  setState({ saveState: "Saving…" });
  saving = (async () => {
    try {
      let saved: Project;
      try {
        saved = await api<Project>("/projects/" + snapshot.id, {
          method: "PUT",
          body: JSON.stringify(snapshot),
        });
      } catch (e) {
        if ((e as { status?: number }).status !== 409 || !base) throw e;
        const server = await api<Project>("/projects/" + snapshot.id);
        let merged: Project;
        try {
          merged = mergeChanges(base, snapshot, server);
        } catch (conflict) {
          setState({
            recovery: {
              draft: {
                key: "",
                project:
                  state.project?.id === snapshot.id ? state.project : snapshot,
                base,
                savedAt: Date.now(),
              },
              server,
              conflict: true,
            },
          });
          throw conflict;
        }
        saved = await api<Project>("/projects/" + snapshot.id, {
          method: "PUT",
          body: JSON.stringify({ ...merged, revision: server.revision }),
        });
      }
      base = saved;
      if (state.project?.id === snapshot.id) {
        const same = state.project === snapshot;
        let current = saved;
        if (!same) {
          try {
            current = {
              ...mergeChanges(snapshot, state.project, saved),
              revision: saved.revision,
              updatedAt: saved.updatedAt,
            };
          } catch (conflict) {
            setState({
              recovery: {
                draft: {
                  key: "",
                  project: state.project,
                  base: snapshot,
                  savedAt: Date.now(),
                },
                server: saved,
                conflict: true,
              },
            });
            throw conflict;
          }
        }
        setState({
          project: current,
          dirty: !same,
          saveState: same ? "Saved" : "Unsaved",
        });
        if (same) {
          clearOwnDraft(snapshot.id);
          setState({ recoveryError: null });
        } else {
          protectUnsavedEdits();
          timer = setTimeout(() => void save(), 800);
        }
      }
    } catch (e) {
      setState({ saveState: "Save failed" });
      protectUnsavedEdits();
      report(e);
    } finally {
      saving = null;
    }
  })();
  return saving;
}
export async function openProject(projectId: string) {
  const began = performance.now();
  const request = ++openRequest;
  try {
    await save();
    if (request !== openRequest) return;
    if (state.dirty || gesture)
      throw new Error(
        "Save failed. Download your current project JSON before opening another session.",
      );
    const [project, assets] = await Promise.all([
      api<Project>("/projects/" + projectId),
      api<Asset[]>("/projects/" + projectId + "/assets"),
    ]);
    if (request !== openRequest) return;
    if (state.dirty || gesture)
      throw new Error(
        "The current project changed while opening. Save it before switching sessions.",
      );
    base = project;
    const content = (p: Project) => {
      const { revision, updatedAt, ...rest } = p;
      return JSON.stringify(rest);
    };
    const drafts = recoveryDrafts(project.id).filter(
      (d) => content(d.project) !== content(project),
    );
    setState({
      recovery: drafts[0]
        ? { draft: drafts[0], server: project, conflict: false }
        : null,
      project,
      assets,
      view:
        localStorage.getItem("studio:experience") === "studio"
          ? "arrange"
          : "create",
      timingSourceAssetId: null,
      selectedTrack: project.tracks[0]?.id ?? null,
      selectedClips: [],
      selectedNotes: [],
      cursor: 0,
      undo: [],
      redo: [],
      dirty: false,
      saveState: "Saved",
      error: null,
      errorStatus: null,
      playing: false,
    });
    localStorage.setItem("studio:lastProject", projectId);
    history.replaceState(null, "", "#" + projectId);
    measured("Project open including network", began);
  } catch (e) {
    if (request === openRequest) report(e);
  }
}
export function resolveRecovery(
  choices: Record<string, "local" | "remote">,
  useServer = false,
) {
  const recovery = state.recovery;
  if (!recovery || state.project?.id !== recovery.server.id) return;
  const { draft, server } = recovery;
  const recovered = useServer
    ? server
    : mergeChanges(
        draft.base || server,
        draft.project,
        server,
        "project",
        (path, _b, l, r) => (choices[path] === "remote" ? r : l),
      );
  base = server;
  setState({
    project: {
      ...recovered,
      revision: server.revision,
      updatedAt: server.updatedAt,
    },
    recovery: null,
    undo: [],
    redo: [],
    error: null,
    errorStatus: null,
  });
  if (!useServer) {
    changed();
    // Only discard the old entry after the selected edits have another durable recovery copy.
    if (!state.recoveryError && draft.key) removeDraft(draft.key);
  } else {
    if (draft.key) removeDraft(draft.key);
    clearOwnDraft(server.id);
    setState({ dirty: false, saveState: "Saved", recoveryError: null });
  }
}

export async function createProject(name = "Untitled session") {
  try {
    await save();
    if (state.dirty)
      throw new Error("Save the current project before creating another.");
    const p = await post<Project>("/projects", { name });
    await openProject(p.id);
  } catch (e) {
    report(e);
  }
}
export const selectedTrack = () =>
  state.project?.tracks.find((t) => t.id === state.selectedTrack);
export const selectedClip = () =>
  state.project?.tracks
    .flatMap((t) => t.clips)
    .find((c) => state.selectedClips.includes(c.id)) ??
  selectedTrack()?.clips[0];
export function addTrack(type: Track["type"] = "audio") {
  const track = newTrack({
    type,
    name:
      type === "midi"
        ? "New instrument"
        : type === "bus"
          ? "Group bus"
          : "New audio",
    color: palette[(state.project?.tracks.length ?? 0) % palette.length],
  });
  if (type === "midi")
    track.clips = [
      newClip({ name: "Pattern", beat: state.cursor, color: track.color }),
    ];
  edit("Add track", (p) => {
    p.tracks.push(track);
  });
  setState({
    selectedTrack: track.id,
    selectedClips: track.clips.map((c) => c.id),
  });
}
export function editTrack(label: string, fn: (t: Track) => void) {
  edit(label, (p) => {
    const t = p.tracks.find((t) => t.id === state.selectedTrack);
    if (t) fn(t);
  });
}
export function editClip(label: string, fn: (c: Clip) => void) {
  const c = selectedClip();
  if (!c) return;
  edit(label, (p) => {
    for (const t of p.tracks)
      for (const clip of t.clips) if (clip.id === c.id) fn(clip);
  });
}
export function deleteSelected(mode: "clips" | "notes" = "clips") {
  if (mode === "notes") {
    const selected = state.selectedNotes;
    editClip("Delete notes", (c) => {
      c.notes = c.notes.filter((n) => !selected.includes(n.id));
    });
    setState({ selectedNotes: [] });
  } else {
    const selected = state.selectedClips;
    edit("Delete clips", (p) => {
      for (const t of p.tracks)
        t.clips = t.clips.filter((c) => !selected.includes(c.id));
    });
    setState({ selectedClips: [] });
  }
}
export function deleteTrack(trackId: string) {
  const tracks = state.project?.tracks;
  const index = tracks?.findIndex((t) => t.id === trackId) ?? -1;
  if (!tracks || index < 0) return;
  const track = tracks[index];
  const clips = new Set(track.clips.map((c) => c.id));
  const notes = new Set(track.clips.flatMap((c) => c.notes.map((n) => n.id)));
  edit("Delete track", (p) => {
    p.tracks = p.tracks.filter((t) => t.id !== trackId);
    // Keep child tracks connected when removing a group bus.
    for (const t of p.tracks) if (t.output === trackId) t.output = track.output;
  });
  const remaining = state.project!.tracks;
  setState({
    selectedTrack:
      state.selectedTrack === trackId
        ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
        : state.selectedTrack,
    selectedClips: state.selectedClips.filter((id) => !clips.has(id)),
    selectedNotes: state.selectedNotes.filter((id) => !notes.has(id)),
  });
  notice(
    `Deleted track “${track.name}”. Undo restores it; source audio is kept.`,
  );
}
export function copy(mode: "clips" | "notes") {
  if (mode === "notes")
    clipBoard.notes = structuredClone(
      selectedClip()?.notes.filter((n) => state.selectedNotes.includes(n.id)) ??
        [],
    );
  else
    clipBoard.clips = structuredClone(
      state.project?.tracks.flatMap((t) =>
        t.clips
          .filter((c) => state.selectedClips.includes(c.id))
          .map((clip) => ({ clip, trackId: t.id })),
      ) ?? [],
    );
}
export function paste(mode: "clips" | "notes", duplicate = false) {
  if (mode === "notes") {
    const notes = duplicate
      ? (selectedClip()?.notes.filter((n) =>
          state.selectedNotes.includes(n.id),
        ) ?? [])
      : clipBoard.notes;
    if (!notes.length) return;
    const min = Math.min(...notes.map((n) => n.beat)),
      max = Math.max(...notes.map((n) => n.beat + n.duration));
    const copies = notes.map((n) => ({
      ...n,
      id: id(),
      beat:
        n.beat -
        min +
        (duplicate
          ? max
          : Math.max(0, state.cursor - (selectedClip()?.beat ?? 0))),
    }));
    editClip(duplicate ? "Duplicate notes" : "Paste notes", (c) => {
      c.notes.push(...copies);
    });
    setState({ selectedNotes: copies.map((n) => n.id) });
  } else {
    const clips = duplicate
      ? (state.project?.tracks.flatMap((t) =>
          t.clips
            .filter((c) => state.selectedClips.includes(c.id))
            .map((clip) => ({ clip, trackId: t.id })),
        ) ?? [])
      : clipBoard.clips;
    if (!clips.length) return;
    const min = Math.min(...clips.map(({ clip: c }) => c.beat)),
      max = Math.max(...clips.map(({ clip: c }) => c.beat + c.duration));
    const copies = clips.map(({ clip: c, trackId }) => ({
      trackId,
      clip: {
        ...structuredClone(c),
        id: id(),
        notes: c.notes.map((n) => ({ ...n, id: id() })),
        beat: c.beat - min + (duplicate ? max : state.cursor),
      },
    }));
    const multipleTracks = new Set(clips.map((c) => c.trackId)).size > 1;
    edit(duplicate ? "Duplicate clips" : "Paste clips", (p) => {
      for (const item of copies) {
        const target = p.tracks.find(
          (t) =>
            t.id ===
            (duplicate || multipleTracks ? item.trackId : state.selectedTrack),
        );
        if (!target)
          throw new Error(
            "A copied track no longer exists. Select clips from the current project.",
          );
        target.clips.push(item.clip);
      }
    });
    setState({ selectedClips: copies.map((c) => c.clip.id) });
  }
}
export function split() {
  const cursor = state.cursor;
  edit("Split clips", (p) => {
    for (const t of p.tracks)
      t.clips = t.clips.flatMap((c) =>
        state.selectedClips.includes(c.id) &&
        cursor > c.beat &&
        cursor < c.beat + c.duration
          ? splitClip(c, cursor, p.tempo)
          : [c],
      );
  });
}
export async function importFile(file: File) {
  const p = state.project;
  if (!p) return;
  const cursor = state.cursor;
  setState({ busy: "Importing " + file.name });
  try {
    if (/\.zip$/i.test(file.name)) {
      const restored = await fileApi<Project>(
        "/projects/import-portable",
        file,
      );
      await openProject(restored.id);
    } else if (/\.mid(i)?$/i.test(file.name)) {
      const result = await fileApi<MidiImportResult>("/midi/import", file);
      if (state.project?.id !== p.id) return;
      if (!result.tracks.length)
        throw new Error("This MIDI file has no notes to import.");
      setState({
        pendingMidi: { projectId: p.id, fileName: file.name, cursor, result },
      });
    } else if (/\.abc$/i.test(file.name)) {
      const abc = await file.text();
      edit("Import score", (p) => {
        p.generation.abc = abc;
        p.generation.useScore = true;
        if (p.generation.cot === "off") p.generation.cot = "full";
      });
      setState({ view: "score" });
    } else {
      const asset = await fileApi<Asset>("/projects/" + p.id + "/import", file);
      setState({ assets: [...state.assets, asset] });
      placeAsset(asset);
    }
  } catch (e) {
    report(e);
  } finally {
    setState({ busy: null });
  }
}
export function confirmMidiImport(useFileTiming: boolean) {
  const pending = state.pendingMidi,
    project = state.project;
  if (!pending || !project || pending.projectId !== project.id) return;
  if (useFileTiming && !canUseMidiTiming(pending.result))
    throw new Error(
      "This file's opening tempo or meter is outside Studio's supported range.",
    );
  if (project.tracks.length + pending.result.tracks.length > 256)
    throw new Error("Import would exceed the project's 256-track limit.");
  const tracks = importedMidiTracks(pending, project.tracks.length);
  edit("Import MIDI", (p) => {
    p.tracks.push(...tracks);
    if (useFileTiming) {
      p.tempo = pending.result.tempo;
      p.timeSignature = pending.result.timeSignature;
    }
  });
  const selected = tracks.find((t) => t.instrument !== "drums") ?? tracks[0];
  setState({
    pendingMidi: null,
    selectedTrack: selected.id,
    selectedClips: [selected.clips[0].id],
    selectedNotes: [],
    view: "score",
  });
  notice(
    `Imported ${tracks.length} MIDI parts. Choose a melody reference to guide a new YuE2 take.`,
  );
}
export function placeAsset(asset: Asset) {
  const c = newClip({
    name: asset.name,
    assetId: asset.id,
    beat: state.cursor,
    duration: (asset.duration * (state.project?.tempo ?? 120)) / 60,
  });
  const target = selectedTrack();
  if (target && ["audio", "ai"].includes(target.type)) {
    c.color = target.color;
    editTrack("Place audio", (t) => {
      t.clips.push(c);
    });
  } else {
    const t = newTrack({
      name: asset.name,
      type: asset.origin === "yue2" ? "ai" : "audio",
      clips: [c],
      color: palette[(state.project?.tracks.length ?? 0) % palette.length],
    });
    c.color = t.color;
    edit("Place audio", (p) => {
      p.tracks.push(t);
    });
    setState({ selectedTrack: t.id });
  }
  setState({ selectedClips: [c.id] });
}
export async function refreshAssets() {
  const projectId = state.project?.id;
  if (!projectId) return;
  const assets = await api<Asset[]>("/projects/" + projectId + "/assets");
  if (state.project?.id === projectId) setState({ assets });
}
export async function refreshCandidates() {
  const projectId = state.project?.id;
  if (!projectId) return;
  await save();
  if (state.project?.id !== projectId) return;
  const server = await api<Project>("/projects/" + projectId);
  if (state.project?.id !== projectId) return;
  if (!state.dirty && !gesture && server.revision >= state.project.revision) {
    base = server;
    setState({ project: server });
  }
  await refreshAssets();
}
