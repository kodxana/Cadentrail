import { it, expect } from "vitest";
import { applyDraft } from "./lyrics";
import { newCreative } from "./visual-model";
import type { Project } from "./model";
it("keeps writing history and advanced score when applying or restoring a draft", () => {
  const p = {
    creative: newCreative(),
    generation: {
      lyrics: "Original",
      style: "Acoustic",
      abc: "Edited score",
      useScore: true,
      seed: 1,
    },
    tracks: [{ name: "Advanced mix" }],
  } as unknown as Project;
  const draft = {
    id: "draft",
    createdAt: 1,
    jobId: null,
    text: "New chorus",
    model: "Qwen/Qwen3-4B",
    operation: "continue",
    seed: 1,
  };
  applyDraft(p, draft, draft.text, true);
  expect(p.generation.lyrics).toBe("Original\n\nNew chorus");
  expect(p.generation.abc).toBe("Edited score");
  expect(p.generation.useScore).toBe(true);
  const backup = p.creative.lyricDrafts[0];
  expect(backup.text).toBe("Original");
  applyDraft(p, backup, backup.text);
  expect(p.generation.lyrics).toBe("Original");
  expect(p.tracks[0].name).toBe("Advanced mix");
});
it("restores descriptions without replacing lyrics", () => {
  const p = {
    creative: newCreative(),
    generation: { lyrics: "Keep lyrics", style: "Original style", seed: 1 },
  } as unknown as Project;
  applyDraft(
    p,
    {
      id: "a",
      createdAt: 1,
      jobId: null,
      text: "Improved style",
      model: "Qwen/Qwen3-4B",
      operation: "enhance",
      seed: 1,
    },
    "Improved style",
  );
  const backup = p.creative.lyricDrafts[0];
  applyDraft(p, backup, backup.text);
  expect(p.generation.style).toBe("Original style");
  expect(p.generation.lyrics).toBe("Keep lyrics");
});

it("keeps arrangement drafts separate and preserves lyrics, score and mix", () => {
  const p = {
    creative: newCreative(),
    generation: {
      style: "Jazz",
      lyrics: "Keep my lyrics",
      instrumentalSections: "[instrumental]",
      abc: "Custom notes",
      useScore: true,
      seed: 3,
    },
    tracks: [{ name: "Custom mix" }],
  } as unknown as Project;
  const draft = {
    id: "arr",
    createdAt: 1,
    jobId: null,
    text: "[intro]\n[verse]\n[outro]",
    model: "Qwen/Qwen3-4B",
    operation: "arrange",
    seed: 3,
  };
  applyDraft(p, draft, "[INTRO]\nDo not sing this\n[verse]\n[outro]");
  expect(p.generation.instrumentalSections).toBe("[intro]\n[verse]\n[outro]");
  expect(p.generation.lyrics).toBe("Keep my lyrics");
  expect(p.generation.abc).toBe("Custom notes");
  expect(p.generation.useScore).toBe(true);
  expect(p.creative.lyricDrafts[0].operation).toBe("before-arrangement");
  applyDraft(p, p.creative.lyricDrafts[0], p.creative.lyricDrafts[0].text);
  expect(p.generation.instrumentalSections).toBe("[instrumental]");
  expect(() => applyDraft(p, draft, "Nothing usable")).toThrow("Add a section");
});
