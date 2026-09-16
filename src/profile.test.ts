import { expect, it } from "vitest";
import { readProfile, saveProfile } from "./profile";
it("accepts a skipped name and preserves Unicode personal names", () => {
  expect(
    readProfile({
      getItem: () => JSON.stringify({ name: "  Zoë 王  ", welcomed: true }),
    }),
  ).toEqual({ name: "Zoë 王", welcomed: true });
  expect(
    readProfile({ getItem: () => JSON.stringify({ name: "", welcomed: true }) })
      .welcomed,
  ).toBe(true);
});
it("recovers safely from malformed, blocked or obsolete preferences", () => {
  for (const value of ["oops", "null", '{"name":77,"welcomed":"true"}'])
    expect(readProfile({ getItem: () => value })).toEqual({
      name: "",
      welcomed: false,
    });
  expect(
    readProfile({
      getItem: () => {
        throw Error("blocked");
      },
    }).welcomed,
  ).toBe(false);
  expect(() => saveProfile("Skipper")).not.toThrow();
});
