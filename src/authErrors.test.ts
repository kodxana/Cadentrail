import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { api } from "./api";
import {
  getState,
  setState,
  report,
  acceptAuthenticatedSession,
} from "./store";
beforeEach(() => setState({ error: null, errorStatus: null, busy: null }));
afterEach(() => vi.unstubAllGlobals());
const failure = (status: number, message: string) =>
  new Response(JSON.stringify({ detail: message }), { status });
it("clears the old sign-in notification when authentication succeeds", () => {
  report(
    Object.assign(new Error("Sign in to your workstation"), { status: 401 }),
  );
  acceptAuthenticatedSession();
  expect(getState().error).toBeNull();
  expect(getState().errorStatus).toBeNull();
});
it("does not hide an unrelated project error after signing in", () => {
  report(Object.assign(new Error("Storage unavailable"), { status: 503 }));
  acceptAuthenticatedSession();
  expect(getState().error).toBe("Storage unavailable");
});
it("does not resurrect a pre-login unauthorized response that arrives after success", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const pending = api("/library").catch(report);
  acceptAuthenticatedSession();
  setState({ busy: "Loading current project" });
  resolve(failure(401, "Sign in to your workstation"));
  await pending;
  expect(getState().error).toBeNull();
  expect(getState().busy).toBe("Loading current project");
});
it("still reports a genuinely unauthorized request made in the current session", async () => {
  acceptAuthenticatedSession();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(failure(401, "Sign in to your workstation")),
  );
  await api("/library").catch(report);
  expect(getState().error).toBe("Sign in to your workstation");
  expect(getState().errorStatus).toBe(401);
});
it("does not suppress a late real server failure across a sign-in", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const pending = api("/library").catch(report);
  acceptAuthenticatedSession();
  resolve(failure(500, "Database unavailable"));
  await pending;
  expect(getState().error).toBe("Database unavailable");
});
