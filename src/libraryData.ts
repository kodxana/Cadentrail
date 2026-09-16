import { useSyncExternalStore } from "react";
import { api, post } from "./api";
import {
  getState,
  save,
  refreshCandidates,
  openProject,
  setState,
} from "./store";
import type { Project } from "./model";
import type { LibraryTrack, MusicLibrary } from "./libraryModel";
import { libraryPlayer } from "./libraryPlayer";
let state: MusicLibrary & { loaded: boolean; error: string | null } = {
  projects: [],
  tracks: [],
  loaded: false,
  error: null,
};
const listeners = new Set<() => void>();
let sequence = 0;
const publish = () => listeners.forEach((fn) => fn());
export const getMusicLibrary = () => state;
export const useMusicLibrary = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
export async function loadMusicLibrary() {
  const request = ++sequence;
  try {
    const data = await api<MusicLibrary>("/library");
    if (request !== sequence) return;
    state = { ...data, loaded: true, error: null };
    libraryPlayer.restore(data.tracks);
    libraryPlayer.refresh(data.tracks);
    publish();
  } catch (error) {
    if (request === sequence) {
      state = {
        ...state,
        error: error instanceof Error ? error.message : String(error),
      };
      publish();
    }
    throw error;
  }
}
async function savedProject() {
  await save();
  if (getState().dirty)
    throw new Error(
      "Save your current edits before changing library metadata.",
    );
}
export async function favoriteTrack(track: LibraryTrack) {
  await savedProject();
  await api("/library/tracks/" + track.id, {
    method: "PATCH",
    body: JSON.stringify({ favorite: !track.favorite }),
  });
  if (getState().project?.id === track.projectId) await refreshCandidates();
  await loadMusicLibrary();
}
export async function updateLibraryProject(
  id: string,
  patch: { favorite?: boolean; archived?: boolean },
) {
  await savedProject();
  const p = await api<Project>("/projects/" + id);
  await api("/projects/" + id, {
    method: "PUT",
    body: JSON.stringify({ ...p, ...patch }),
  });
  if (getState().project?.id === id) await refreshCandidates();
  await loadMusicLibrary();
}
export async function duplicateLibraryProject(id: string) {
  await savedProject();
  const p = await post<Project>("/projects/" + id + "/duplicate");
  await openProject(p.id);
  await loadMusicLibrary();
}
export async function openTrackStudio(track: LibraryTrack) {
  await openProject(track.projectId);
  if (getState().project?.id === track.projectId && !getState().dirty)
    setState({ view: "arrange" });
}
export function projectAudioTrack(
  assetId: string,
  name: string,
  duration: number,
): LibraryTrack {
  const known = state.tracks.find((t) => t.id === assetId);
  if (known) return known;
  const p = getState().project;
  const candidate = p?.candidates.find((c) => c.assetId === assetId);
  return {
    id: assetId,
    projectId: p?.id || "",
    title: p?.name || name,
    version: name,
    artist: p?.artist || "",
    kind: candidate ? "take" : "audio",
    duration,
    favorite: candidate?.favorite || false,
    candidateId: candidate?.id,
    coverUrl: p?.visuals.coverId
      ? `/api/projects/${p.id}/visuals/${p.visuals.coverId}`
      : null,
    url: `/api/assets/${assetId}/audio`,
    archived: p?.archived || false,
    tags: p?.tags || [],
    updatedAt: p?.updatedAt || 0,
    origin: "",
  };
}
