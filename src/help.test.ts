import { expect, it } from "vitest";
import { chapters, searchChapters } from "./helpContent";
import { tours } from "./helpTours";
import { readHelpProgress, writeHelpProgress } from "./helpProgress";

it("finds workflows by ordinary words and ranks named topics first", () => {
  expect(searchChapters("Japanese language")[0].id).toBe("radio-settings");
  expect(searchChapters("backup").some((c) => c.id === "files")).toBe(true);
  expect(searchChapters("duet timing").some((c) => c.id === "timing")).toBe(
    true,
  );
  expect(searchChapters("ZXQdoesnotexist")).toEqual([]);
  expect(searchChapters("   ")).toEqual(chapters);
});
it("keeps chapter links and every tour's full-guide destination valid", () => {
  const ids = new Set(chapters.map((c) => c.id));
  expect(ids.size).toBe(chapters.length);
  for (const c of chapters)
    for (const id of c.related)
      expect(ids.has(id), c.id + " → " + id).toBe(true);
  for (const tour of Object.values(tours))
    for (const step of tour.steps)
      expect(ids.has(step.article), step.title).toBe(true);
});
it("rejects corrupt or obsolete tour progress without blocking help", () => {
  expect(readHelpProgress({ getItem: () => "null" }).tours).toEqual({});
  const value = readHelpProgress({
    getItem: () =>
      JSON.stringify({
        article: 2,
        tours: {
          create: { step: -1, state: "paused" },
          radio: { step: 2, state: "paused" },
          listen: { step: 0, state: "unknown" },
          obsolete: { step: 1, state: "complete" },
        },
      }),
  });
  expect(value).toEqual({
    article: "start",
    tours: { radio: { step: 2, state: "paused" } },
  });
});
it("retains a visit's progress if browser storage is blocked", () => {
  const progress = {
    article: "radio",
    tours: { radio: { step: 2, state: "paused" as const } },
  };
  writeHelpProgress(progress, {
    setItem: () => {
      throw Error("blocked");
    },
  });
  expect(
    readHelpProgress({
      getItem: () => {
        throw Error("blocked");
      },
    }),
  ).toEqual(progress);
});
