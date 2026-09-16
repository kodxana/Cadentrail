import type { Asset, Generation, Project } from "./model";
import { instrumentalDirection } from "./generationPresentation";

// Decide the default from the selected recording, not the project's next take.
export function automaticVideoLyrics(
  project: Project,
  assets: Asset[],
  assetId?: string | null,
): boolean {
  if (!assetId) return true;
  const timing = project.visuals.timing;
  if (timing.assetId === assetId && timing.lines.length && !timing.needsReview)
    return true;
  const pending = [assetId],
    visited = new Set<string>();
  let known = false;
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const take = project.candidates.find((c) => c.assetId === id);
    const generation = take?.metadata.generation as
      Partial<Generation> | undefined;
    if (
      generation &&
      typeof generation.role === "string" &&
      typeof generation.style === "string"
    ) {
      known = true;
      if (
        !instrumentalDirection({
          role: generation.role,
          style: generation.style,
        })
      )
        return true;
      continue;
    }
    const parents = assets.find((a) => a.id === id)?.lineage?.sourceAssetIds;
    if (
      !Array.isArray(parents) ||
      !parents.length ||
      !parents.every((p) => typeof p === "string")
    )
      return true;
    pending.push(...parents);
  }
  return !known;
}
