import { expect, it } from "vitest";
import { instrumentalDirection } from "./generationPresentation";
it("matches automatic instrumental direction while respecting chosen vocals", () => {
  expect(
    instrumentalDirection({ role: "auto", style: "Classical chamber music" }),
  ).toBe(true);
  expect(
    instrumentalDirection({ role: "auto", style: "No vocals, warm jazz" }),
  ).toBe(true);
  expect(
    instrumentalDirection({
      role: "auto",
      style: "Classical opera with choir",
    }),
  ).toBe(false);
  for (const style of [
    "Folk duet with an instrumental intro",
    "Rock song with an instrumental bridge",
    "Not instrumental",
  ]) {
    expect(instrumentalDirection({ role: "auto", style })).toBe(false);
  }
  expect(
    instrumentalDirection({
      role: "auto",
      style: "Instrumental jazz with no singing",
    }),
  ).toBe(true);
  expect(
    instrumentalDirection({ role: "female", style: "Classical piano" }),
  ).toBe(false);
  expect(
    instrumentalDirection({ role: "instrumental", style: "Folk duet" }),
  ).toBe(true);
});
