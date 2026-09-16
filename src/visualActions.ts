import { save,getState,setState,notice } from "./store";
import {post} from "./api";
import type {Job} from "./model";
export const visualUrl = (projectId: string, assetId: string) =>
  "/api/projects/" + projectId + "/visuals/" + assetId;
export async function queueVisual(
  kind: string,
  options: Record<string, unknown> = {},
  assetId?: string | null,
) {
  await save();
  const s = getState();
  if (s.dirty) throw new Error("Save your changes before starting a render.");
  const job = await post<Job>("/jobs", {
    projectId: s.project!.id,
    kind,
    assetId,
    options,
  });
  setState({ jobs: [job, ...s.jobs] });
  notice("Queued. Your originals stay in the project.");
  return job;
}
