export type LibraryTrack = {
  id: string;
  projectId: string;
  title: string;
  artist: string;
  version: string;
  kind: "take" | "master" | "mix" | "stem" | "audio";
  duration: number;
  favorite: boolean;
  candidateId?: string | null;
  timingAssetIds?: string[];
  coverUrl: string | null;
  url: string;
  archived: boolean;
  tags: string[];
  updatedAt: number;
  origin: string;
};
export type LibraryProject = {
  id: string;
  name: string;
  artist: string;
  favorite: boolean;
  archived: boolean;
  tags: string[];
  updatedAt: number;
  tempo: number;
  coverUrl: string | null;
  trackCount: number;
  candidateCount: number;
  songCount: number;
  style: string;
};
export type MusicLibrary = {
  projects: LibraryProject[];
  tracks: LibraryTrack[];
};
export const trackKind = {
  take: "Take",
  master: "Master",
  mix: "Mix",
  stem: "Stem",
  audio: "Audio",
};
export const durationLabel = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
