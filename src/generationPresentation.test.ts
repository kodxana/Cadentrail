import { describe, expect, it } from "vitest";
import { generationLimit, renderPresetKey } from "./generationPresentation";

describe("generation result boundaries", () => {
  it("does not treat a complete flags object or absent legacy metadata as truncated", () => {
    for (const value of [
      undefined,
      null,
      false,
      {},
      { abc: false, semantic: false },
      { abc: "true", semantic: 1 },
      [true],
      "true",
    ])
      expect(generationLimit(value)).toBeNull();
  });
  it("distinguishes a limited plan from an incomplete ending", () => {
    expect(generationLimit({ abc: true, semantic: false })).toMatch(
      /score plan/,
    );
    expect(generationLimit({ abc: true, semantic: false })).not.toMatch(
      /ending/,
    );
    expect(generationLimit({ abc: false, semantic: true })).toMatch(/ending/);
    expect(generationLimit({ abc: true, semantic: true })).toMatch(
      /score plan and ending/,
    );
    expect(generationLimit(true)).toMatch(/ending/);
  });
  it("keeps saved preset keys and identifies mismatched Studio or revision settings", () => {
    expect(renderPresetKey("maximum", 64)).toBe("maximum");
    expect(renderPresetKey("balanced", 32)).toBe("balanced");
    expect(renderPresetKey("balanced", 48)).toBe("custom");
    expect(renderPresetKey("custom", 32)).toBe("custom");
    expect(renderPresetKey("toString", 32)).toBe("custom");
  });
});
