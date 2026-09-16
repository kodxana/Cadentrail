import type { StorageInfo } from './StorageStatus';
import { storageSize } from './StorageStatus';
export type DownloadModel = {
  id: string; name: string; repo: string; bytes: number; missingBytes: number;
  core: boolean; sizeEstimated: boolean; license?: string;
};
export type DownloadRequest = {
  code: "model_download_required"; models: DownloadModel[]; freeBytes: number | null; downloadBytes: number; storage?: StorageInfo;
};
type Pending = { details: DownloadRequest; finish: (accepted: boolean) => void };
let pending: Pending | null = null;
const queued: Pending[] = [];
const listeners = new Set<() => void>();
export const downloadPrompt = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => pending,
  answer(accepted: boolean) {
    const current = pending;
    pending = queued.shift() ?? null;
    listeners.forEach(listener => listener());
    current?.finish(accepted);
  },
};
export function confirmModelDownload(details: DownloadRequest) {
  return new Promise<boolean>(finish => {
    const item = { details, finish };
    if (pending) queued.push(item); else pending = item;
    listeners.forEach(listener => listener());
  });
}
export class DownloadCancelled extends Error {
  constructor() { super("Model download cancelled"); this.name = "DownloadCancelled"; }
}
export function modelSize(bytes: number) {
  return storageSize(bytes);
}
