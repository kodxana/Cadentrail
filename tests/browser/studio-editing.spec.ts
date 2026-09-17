import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { newTrack, newClip, newNote } from "../../src/model";

async function setup(page: Page) {
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
  const p = await (await page.request.post("/api/_test/takes")).json();
  const bus = newTrack({ name: "Group", type: "bus" });
  const audio = newTrack({
    name: "Recording",
    output: bus.id,
    clips: [newClip({ assetId: p.candidates[0].assetId, duration: 8 })],
  });
  const keys = newTrack({
    name: "Keys",
    type: "midi",
    clips: [newClip({ notes: [newNote(0, 60, 2)] })],
  });
  p.tracks = [audio, keys, bus];
  p.name = "Studio regression";
  const result = await page.request.put("/api/projects/" + p.id, { data: p });
  expect(result.ok(), await result.text()).toBeTruthy();
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
  await expect(page.getByLabel("Arrangement timeline")).toBeVisible();
  return { p, audio, keys, bus };
}

test("sidebar deletes the targeted track, keeps source audio and undoes the whole row", async ({
  page,
}) => {
  const { p, audio, keys } = await setup(page);
  await page.getByRole("button", { name: "Project browser", exact: true }).click();
  await page.locator(".browser-track").filter({ hasText: "Recording" }).click();
  await page
    .locator(".browser-track")
    .filter({ hasText: "Keys" })
    .click({ button: "right" });
  await page.screenshot({ path: ".runtime/studio-track-menu.png" });
  await page
    .getByRole("menuitem", { name: "Delete track", exact: true })
    .click();
  await expect(page.locator(".browser-track")).toHaveCount(2);
  await expect
    .poll(async () =>
      (
        await (await page.request.get("/api/projects/" + p.id)).json()
      ).tracks.map((t: any) => t.id),
    )
    .toEqual([audio.id, p.tracks[2].id]);
  expect(
    (
      await page.request.get("/api/assets/" + audio.clips[0].assetId + "/audio")
    ).ok(),
  ).toBeTruthy();
  await page.getByTitle("Undo (Ctrl+Z)", { exact: true }).click();
  await expect(
    page.locator(".browser-track").filter({ hasText: "Keys" }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await (await page.request.get("/api/projects/" + p.id)).json()
        ).tracks.find((t: any) => t.id === keys.id)?.clips,
    )
    .toEqual(keys.clips);
  await page.getByLabel("Track actions for Group", { exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete track", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/projects/" + p.id)).json())
          .tracks[0].output,
    )
    .toBe("master");
  await page.reload();
  if (await page.getByRole("button", { name: "Project browser", exact: true }).getAttribute("aria-expanded") === "false")
    await page.getByRole("button", { name: "Project browser", exact: true }).click();
  await expect(page.locator(".browser-track")).toHaveCount(2);
});

test("timeline distinguishes clip deletion from deleting an empty track header", async ({
  page,
}) => {
  const { p, audio, keys, bus } = await setup(page);
  const timeline = page.getByLabel("Arrangement timeline");
  await timeline.click({ position: { x: 240, y: 110 } });
  await timeline.click({ position: { x: 240, y: 192 }, button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Delete track", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("menuitem", { name: "Delete clips", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await (await page.request.get("/api/projects/" + p.id)).json()
        ).tracks.find((t: any) => t.id === keys.id)?.clips,
    )
    .toEqual([]);
  await timeline.click({ position: { x: 70, y: 192 }, button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete track", exact: true })
    .click();
  await expect
    .poll(async () =>
      (
        await (await page.request.get("/api/projects/" + p.id)).json()
      ).tracks.map((t: any) => t.id),
    )
    .toEqual([audio.id, bus.id]);
  const current = await (
    await page.request.get("/api/projects/" + p.id)
  ).json();
  expect(current.tracks[0].clips).toEqual(audio.clips);
});

for (const width of [1440, 390])
  test(`Studio renders a real audio download at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await setup(page);
    await page
      .getByRole("button", { name: "Render audio", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Render audio", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Turn your Studio arrangement into one stereo audio file.",
        { exact: false },
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({ path: `.runtime/studio-render-${width}.png` });
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Render and download", exact: true })
      .click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe("Studio regression.wav");
    expect(await file.failure()).toBeNull();
    const wav = await readFile((await file.path())!);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.length).toBeGreaterThan(48000 * 4);
    const data = wav.indexOf(Buffer.from("data"));
    expect(data).toBeGreaterThan(0);
    expect(wav.subarray(data + 8).some((byte) => byte > 0)).toBeTruthy();
    await expect(
      page.getByText(
        "Audio rendered. Your download is ready: Studio regression.wav",
        { exact: true },
      ),
    ).toBeVisible();
  });
