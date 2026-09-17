import { expect, it } from "vitest";
import type { Generation } from "./model";
import {
  generationFromCandidate,
  generationInputIssue,
  generationInputSummary,
} from "./generationInputs";
const settings = (value: Partial<Generation> = {}): Generation =>
  ({
    abc: "X:1\nK:C\nC D",
    useScore: false,
    cot: "full",
    style: "Jazz",
    lyrics: "Words",
    role: "auto",
    ...value,
  }) as Generation;
it("distinguishes a stored but unused score from an enabled reference", () => {
  expect(generationInputSummary(settings()).reference).toBe("Saved ABC is off");
  expect(generationInputSummary(settings({ useScore: true })).score).toBe(true);
  expect(generationInputIssue(settings({ abc: " ", cot: "off" }))).toBeNull();
});
it("rejects enabled empty scores, direct planning and conflicting hum inputs", () => {
  expect(
    generationInputIssue(settings({ useScore: true, abc: " \n" })),
  ).toMatch(/empty/);
  expect(
    generationInputIssue(settings({ useScore: true, cot: "off" })),
  ).toMatch(/planning/);
  expect(
    generationInputIssue(
      settings({ useScore: true, hum: { assetId: "a" } as any }),
    ),
  ).toMatch(/Choose one/);
});
it("describes actual instrumental routing, including automatic direction and original engine", () => {
  expect(
    generationInputSummary(settings({ style: "Classical piano" })).words,
  ).toContain("section tags");
  expect(
    generationInputSummary(
      settings({ style: "Classical piano", musicAdapter: "base" }),
    ).words,
  ).toContain("no-vocals style");
  expect(
    generationInputSummary(
      settings({ style: "Classical piano", role: "female" }),
    ).words,
  ).toBe("lyrics and vocal direction");
});
it("revising a hum-guided take does not attach a second incompatible score", () => {
  const original = settings({
    hum: { assetId: "source", mode: "melody" } as any,
  });
  const candidate = {
    abc: "X:1\nK:C\nE F",
    metadata: { generation: original },
  };
  const next = generationFromCandidate(settings(), candidate);
  expect(next.abc).toBe(candidate.abc);
  expect(next.hum).toEqual(original.hum);
  expect(next.useScore).toBe(false);
  expect(generationInputIssue(next)).toBeNull();
  expect(original.useScore).toBe(false);
});
it("respects direct generation while reusing a planned vocal score deliberately", () => {
  const candidate = {
    abc: "X:1\nK:C\nE F",
    metadata: { generation: settings({ cot: "off" }) },
  };
  expect(generationFromCandidate(settings(), candidate).useScore).toBe(false);
  candidate.metadata.generation = settings();
  expect(generationFromCandidate(settings(), candidate).useScore).toBe(true);
});

it("direct generation does not offer a nonexistent score plan", () => {
  const g = settings({ cot: "off", useScore: false });
  expect(generationInputIssue(g)).toBeNull();
  expect(generationInputIssue(g, "plan")).toMatch(/planning is off/);
  expect(
    generationInputIssue({ ...g, hum: { assetId: "source" } as any }, "plan"),
  ).toBeNull();
});
