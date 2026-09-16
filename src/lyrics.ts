import { id, type Project } from "./model";
import type { LyricDraft } from "./visual-model";

export const draftContext = (operation: string) =>
  ["enhance", "before-description"].includes(operation)
    ? "description"
    : ["arrange", "before-arrangement"].includes(operation)
      ? "arrangement"
      : "lyrics";

export function applyDraft(
  project: Project,
  draft: LyricDraft,
  text: string,
  append = false,
) {
  const context = draftContext(draft.operation);
  const description = context === "description",
    arrangement = context === "arrangement";
  const original = description
    ? project.generation.style
    : arrangement
      ? (project.generation.instrumentalSections ?? "[instrumental]")
      : project.generation.lyrics;
  const next = arrangement
    ? (
        text.match(
          /\[\s*(intro|verse|pre-chorus|chorus|bridge|instrumental|outro)\s*\]/gi,
        ) ?? []
      )
        .slice(0, 32)
        .map((tag) => tag.toLowerCase().replace(/\s/g, ""))
        .join("\n")
    : append
      ? `${original.trimEnd()}\n\n${text}`.trim()
      : text;
  if (arrangement && !next)
    throw new Error(
      "Add a section such as [intro] or [instrumental] before applying.",
    );
  if (next.length > (description ? 8000 : arrangement ? 2000 : 30000))
    throw new Error("This draft is too long. Shorten it before applying.");
  if (original)
    project.creative.lyricDrafts.push({
      id: id(),
      createdAt: Date.now() / 1000,
      jobId: null,
      text: original,
      model: "Your writing",
      operation: description
        ? "before-description"
        : arrangement
          ? "before-arrangement"
          : "before-lyrics",
      seed: project.generation.seed,
    });
  if (text !== draft.text)
    project.creative.lyricDrafts.push({
      ...draft,
      id: id(),
      createdAt: Date.now() / 1000,
      text,
      languageConfidence: null,
    });
  project.creative.lyricDrafts = project.creative.lyricDrafts.slice(-100);
  if (description) project.generation.style = next;
  else if (arrangement) project.generation.instrumentalSections = next;
  else project.generation.lyrics = next;
}
