import { test, expect, type Page } from "@playwright/test";
import { newClip, newNote, newTrack } from "../../src/model";

async function setup(page: Page, width: number, existing = false) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "cadentrail:profile",
      JSON.stringify({ name: "", welcomed: true }),
    );
    localStorage.setItem("studio:experience", "studio");
  });
  expect(
    (
      await page.request.post("/api/auth", {
        data: { password: "cadentrail-browser-test" },
      })
    ).ok(),
  ).toBeTruthy();
  const p = await (
    await page.request.post("/api/projects", {
      data: { name: "MIDI reference check" },
    })
  ).json();
  p.tracks = [
    newTrack({
      name: "Existing keys",
      type: "midi",
      clips: [newClip({ notes: existing ? [newNote(0, 48)] : [] })],
    }),
  ];
  p.chords = [];
  p.sections = [];
  p.tempo = 120;
  p.timeSignature = [4, 4];
  p.generation.abc = "";
  p.generation.useScore = false;
  expect(
    (await page.request.put("/api/projects/" + p.id, { data: p })).ok(),
  ).toBeTruthy();
  await page.goto("/#" + p.id);
  await expect(
    page.getByRole("textbox", { name: "Project name", exact: true }),
  ).toHaveValue(p.name);
  const studio = page.getByRole("button", { name: "Studio", exact: true });
  if (await studio.isVisible()) await studio.click();
  else {
    await page.getByLabel("More workspaces").click();
    await page
      .getByRole("button", { name: "Open Studio", exact: true })
      .click();
  }
  const midi = await page.request.post("/api/midi/export", {
    data: {
      tempo: 200,
      timeSignature: [6, 8],
      notes: [
        { ...newNote(0, 72, 1), channel: 3 },
        { ...newNote(2, 74, 1), channel: 3 },
        { ...newNote(1, 72, 1), channel: 6 },
        { ...newNote(3, 74, 1), channel: 6 },
        { ...newNote(0, 36, 1), channel: 9 },
      ],
    },
  });
  expect(midi.ok()).toBeTruthy();
  const file = {
    name: "Multichannel reference.mid",
    mimeType: "audio/midi",
    buffer: await midi.body(),
  };
  await page.locator('input[type="file"][accept*=".mid"]').setInputFiles(file);
  await expect(
    page.getByRole("heading", { name: "Import MIDI", exact: true }),
  ).toBeVisible();
  return { p, file };
}

for (const width of [1440, 390])
  test(`MIDI reference remains explicit and preserves all parts at ${width}px`, async ({
    page,
  }) => {
    const { p } = await setup(page, width);
    await expect(page.getByLabel("Arrangement timing")).toHaveValue("file");
    await page.screenshot({ path: `.runtime/midi-import-${width}.png` });
    await page
      .getByRole("button", { name: "Import 3 parts", exact: true })
      .click();
    await expect(page.getByLabel("Piano roll clip")).toContainText("Ch 4");
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/projects/" + p.id)).json())
            .tracks.length,
      )
      .toBe(4);
    const imported = await (
      await page.request.get("/api/projects/" + p.id)
    ).json();
    expect(imported.tempo).toBe(200);
    expect(imported.timeSignature).toEqual([6, 8]);
    expect(imported.generation.useScore).toBe(false);
    const lead = imported.tracks.find((t: any) => t.name.includes("Ch 4"));
    expect(await page.getByLabel("Piano roll clip").inputValue()).toBe(
      lead.clips[0].id,
    );
    await page
      .getByRole("button", { name: "Choose melody for YuE2", exact: true })
      .click();
    await expect(page.getByLabel("Melody source")).toHaveValue(
      lead.clips[0].id,
    );
    await expect(page.getByLabel("Guidance", { exact: true })).toHaveValue(
      "melody",
    );
    const dialog = page.getByRole("dialog", {
      name: "Melody reference for YuE2",
    });
    expect(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBeTruthy();
    await page.screenshot({ path: `.runtime/midi-reference-${width}.png` });
    await page
      .getByRole("button", { name: "Use for next take", exact: true })
      .click();
    await expect(page.getByLabel("ABC source")).toBeVisible();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/projects/" + p.id)).json())
            .generation.useScore,
      )
      .toBe(true);
    const saved = await (
      await page.request.get("/api/projects/" + p.id)
    ).json();
    expect(saved.generation.cot).toBe("melody");
    expect(saved.tracks).toEqual(imported.tracks);
    const parsed = await (
      await page.request.post("/api/score/parse", {
        data: { abc: saved.generation.abc },
      })
    ).json();
    expect(parsed.notes.map((n: any) => [n.pitch, n.beat, n.duration])).toEqual(
      [
        [72, 0, 1],
        [74, 2, 1],
      ],
    );
    expect(parsed.chords).toEqual([]);
    expect(parsed.tempo).toBe(200);
    await page.locator(".model-inputs summary").click();
    await expect(
      page.getByText("Sent to YuE2:", { exact: false }),
    ).toBeVisible();
    await expect(page.locator(".model-inputs")).toContainText("snapshot");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  });

test("existing arrangement keeps its tempo and cancelling MIDI import changes nothing", async ({
  page,
}) => {
  const { p, file } = await setup(page, 1440, true);
  await expect(page.getByLabel("Arrangement timing")).toHaveValue("project");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const before = await (await page.request.get("/api/projects/" + p.id)).json();
  expect(before.tracks).toEqual(p.tracks);
  expect(before.tempo).toBe(120);
  await page.locator('input[type="file"][accept*=".mid"]').setInputFiles(file);
  await page
    .getByRole("button", { name: "Import 3 parts", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/projects/" + p.id)).json()).tracks
          .length,
    )
    .toBe(4);
  const after = await (await page.request.get("/api/projects/" + p.id)).json();
  expect(after.tempo).toBe(120);
  expect(after.timeSignature).toEqual([4, 4]);
  expect(after.tracks[0]).toEqual(p.tracks[0]);
});
