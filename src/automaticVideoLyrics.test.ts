import { expect, it } from "vitest";
import type { Asset, Project } from "./model";
import { automaticVideoLyrics } from "./automaticVideoLyrics";
it("avoids aligning unused instrumental lyrics while preserving vocal mixes and reviewed timing", () => {
  const p = {
    generation: { role: "female", lyrics: "Keep these words" },
    candidates: [
      {
        assetId: "instrumental",
        metadata: { generation: { role: "instrumental", style: "Jazz" } },
      },
      {
        assetId: "vocal",
        metadata: {
          generation: { role: "auto", style: "Duet with instrumental intro" },
        },
      },
    ],
    visuals: { timing: { assetId: null, lines: [], needsReview: true } },
  } as unknown as Project;
  const assets = [
    { id: "master", lineage: { sourceAssetIds: ["instrumental"] } },
    { id: "mix", lineage: { sourceAssetIds: ["instrumental", "vocal"] } },
    { id: "cycle", lineage: { sourceAssetIds: ["cycle"] } },
  ] as Asset[];
  expect(automaticVideoLyrics(p, assets, "instrumental")).toBe(false);
  expect(automaticVideoLyrics(p, assets, "master")).toBe(false);
  expect(automaticVideoLyrics(p, assets, "vocal")).toBe(true);
  expect(automaticVideoLyrics(p, assets, "mix")).toBe(true);
  expect(automaticVideoLyrics(p, assets, "uploaded")).toBe(true);
  expect(automaticVideoLyrics(p, assets, "cycle")).toBe(true);
  p.visuals.timing = {
    ...p.visuals.timing,
    assetId: "instrumental",
    needsReview: false,
    lines: [
      {
        id: "reviewed",
        text: "Intentional",
        start: 0,
        end: 1,
        words: [],
        confidence: null,
        source: "manual",
        section: "",
      },
    ],
  };
  expect(automaticVideoLyrics(p, assets, "instrumental")).toBe(true);
  expect(p.generation.lyrics).toBe("Keep these words");
});
