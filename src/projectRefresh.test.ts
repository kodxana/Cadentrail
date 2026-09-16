import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Project } from "./model";
import { beginGesture, finishGesture, getState, openProject, refreshAssets, refreshCandidates, setState } from "./store";

const project = (id: string, revision = 1) => ({ id, revision, name: id, tracks: [] }) as unknown as Project;
const response = (data: unknown) => new Response(JSON.stringify(data));
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  setState({ project: project("a"), assets: [], dirty: false, error: null });
});
afterEach(() => { finishGesture("End test gesture"); vi.unstubAllGlobals(); });

it("late assets from the previous project cannot replace the open project's assets", async () => {
  const slow = deferred();
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(slow.promise));
  const refresh = refreshAssets();
  const assets = [{ id: "b-audio" }] as any;
  setState({ project: project("b"), assets });
  slow.resolve(response([{ id: "a-audio" }]));
  await refresh;
  expect(getState().assets).toBe(assets);
});

it("late generation refresh cannot reopen the previous project", async () => {
  const slow = deferred();
  const fetch = vi.fn().mockReturnValue(slow.promise);
  vi.stubGlobal("fetch", fetch);
  const refresh = refreshCandidates();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  setState({ project: project("b") });
  slow.resolve(response(project("a", 2)));
  await refresh;
  expect(getState().project?.id).toBe("b");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("a background refresh preserves a drag that has not yet reached autosave", async () => {
  const slow = deferred();
  const fetch = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValue(response([]));
  vi.stubGlobal("fetch", fetch);
  const refresh = refreshCandidates();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  beginGesture();
  const current = getState().project;
  slow.resolve(response(project("a", 2)));
  await refresh;
  expect(getState().project).toBe(current);
});

it("the most recent project choice wins when opening requests finish out of order", async () => {
  const slow = deferred();
  const fetch = vi.fn((url: string) => url === "/api/projects/b" ? slow.promise : Promise.resolve(response(url.endsWith("/assets") ? [] : project("c"))));
  vi.stubGlobal("fetch", fetch);
  const first = openProject("b");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await openProject("c");
  slow.resolve(response(project("b")));
  await first;
  expect(getState().project?.id).toBe("c");
});

it("reopening the current project cannot discard edits after a failed save", async () => {
  const fetch = vi.fn().mockResolvedValue(response({ detail: "Storage unavailable" }));
  fetch.mockResolvedValue(new Response(JSON.stringify({ detail: "Storage unavailable" }), { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  setState({ dirty: true });
  const current = getState().project;
  await openProject("a");
  expect(getState().project).toBe(current);
  expect(getState().dirty).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
