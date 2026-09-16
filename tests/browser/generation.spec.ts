import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "cadentrail:profile",
      JSON.stringify({ name: "", welcomed: true }),
    );
    localStorage.setItem("studio:experience", "create");
  });
  expect(
    (
      await page.request.post("/api/auth", {
        data: { password: "cadentrail-browser-test" },
      })
    ).ok(),
  ).toBeTruthy();
  const response = await page.request.post("/api/_test/takes");
  expect(response.ok()).toBeTruthy();
  const project = await response.json();
  await page.goto("/#" + project.id);
  await expect(
    page.getByRole("textbox", { name: "Project name", exact: true }),
  ).toHaveValue(project.name);
  return project;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}
test.afterEach(async ({ page }) => {
  await page.request.post("/api/_test/reset-signin");
});

for (const width of [1440, 390]) {
  test(`limited takes stay playable and revisions preserve originals at ${width}px`, async ({
    page,
  }) => {
    const p = await setup(page, width);
    const jobs = await (await page.request.get("/api/jobs")).json();
    const assets = await (
      await page.request.get(`/api/projects/${p.id}/assets`)
    ).json();
    const take = page.locator(".song-take");
    await expect(take).toHaveCount(4);
    await expect(take.nth(0).getByRole("note")).toHaveCount(0);
    await expect(take.nth(3).getByRole("note")).toHaveCount(0);
    await expect(take.nth(1).getByRole("note")).toContainText(
      "ending may be incomplete",
    );
    await expect(take.nth(2).getByRole("note")).toContainText(
      "score plan may be incomplete",
    );
    await take
      .nth(1)
      .getByRole("button", { name: /Select .* for playback/ })
      .click();
    await page.getByRole("button", { name: "Play song", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause song", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause song", exact: true }).click();
    await take.nth(1).scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({
      animations: "disabled",
      path: `.runtime/045-limited-take-${width}.png`,
    });
    await take
      .nth(1)
      .getByRole("button", { name: "Prepare new take", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Revised take", exact: true }),
    ).toContainText("original take stays saved");
    await page
      .locator(".create-steps")
      .getByRole("button", { name: /Performance/ })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Rendering preset", exact: true }),
    ).toHaveValue("custom");
    await expect(page.locator(".advanced-generation")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(
      page.getByText(
        "Length follows the lyrics and composition. Exact duration is not guaranteed.",
      ),
    ).toBeVisible();
    await expect(page.locator("#create-vocal-hint")).toContainText(
      "who sings each line can vary",
    );
    await noOverflow(page);
    await page.screenshot({
      animations: "disabled",
      path: `.runtime/045-performance-${width}.png`,
    });
    await page
      .getByRole("combobox", { name: "Rendering preset", exact: true })
      .selectOption("balanced");
    await expect
      .poll(async () => {
        const saved = await (
          await page.request.get("/api/projects/" + p.id)
        ).json();
        return {
          parent: saved.creative.parentId,
          steps: saved.generation.odeSteps,
        };
      })
      .toEqual({ parent: p.candidates[1].id, steps: 32 });
    const revised = await (
      await page.request.get("/api/projects/" + p.id)
    ).json();
    expect(revised.creative.parentId).toBe(p.candidates[1].id);
    expect(revised.generation.seed).not.toBe(p.candidates[1].seed);
    expect(revised.candidates).toEqual(p.candidates);
    expect(
      await (await page.request.get(`/api/projects/${p.id}/assets`)).json(),
    ).toEqual(assets);
    expect(await (await page.request.get("/api/jobs")).json()).toEqual(jobs);
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Rendering preset", exact: true }),
    ).toHaveValue("balanced");
    await expect(
      page.getByRole("complementary", { name: "Revised take", exact: true }),
    ).toBeVisible();
  });
  test(`Radio distinguishes requested settings without changing saved recipes at ${width}px`, async ({
    page,
  }) => {
    await setup(page, width);
    const current = await (await page.request.get("/api/radio/current")).json();
    if (current) await page.request.delete("/api/radio/" + current.id);
    await page.getByRole("button", { name: "Radio", exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: "Rendering preset", exact: true }),
    ).toHaveValue("balanced");
    await page
      .getByRole("combobox", { name: "Vocal direction", exact: true })
      .selectOption("duet");
    await page
      .getByRole("combobox", { name: "Lyric language", exact: true })
      .selectOption("ja");
    await expect(page.locator("#radio-language-hint")).toContainText(
      "not verified",
    );
    await expect(page.locator("#radio-vocal-hint")).toContainText(
      "who sings each line can vary",
    );
    await page.locator(".radio-settings").scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({
      animations: "disabled",
      path: `.runtime/045-radio-settings-${width}.png`,
    });
    const station = await (await page.request.post("/api/_test/radio")).json();
    await expect(page.locator(".radio-language")).toContainText(
      "Requested lyrics · Japanese",
    );
    await page
      .getByRole("button", { name: "Adjust station", exact: true })
      .click();
    await expect(page.locator("#live-language-hint")).toContainText(
      "not verified",
    );
    const same = await (await page.request.get("/api/radio/current")).json();
    expect(same.id).toBe(station.id);
    expect(same.tracks[0].startedAt).toBe(station.tracks[0].startedAt);
    expect(same.settings.quality).toBe("balanced");
    await page.getByRole("button", { name: "Stop Radio", exact: true }).click();
  });
}
