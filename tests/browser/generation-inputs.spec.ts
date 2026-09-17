import { test, expect, type Page } from "@playwright/test";
const sourceABC = "X:1\nT:Take score\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nC D E G |]";
const savedABC =
  "X:1\nT:Existing reference\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nA B c d |]";
async function setup(page: Page, width: number, invalid = false) {
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
  const p = await (await page.request.post("/api/_test/takes")).json();
  p.candidates[0].abc = sourceABC;
  p.generation.abc = invalid ? "" : savedABC;
  p.generation.useScore = true;
  p.generation.cot = invalid ? "off" : "full";
  const result = await page.request.put("/api/projects/" + p.id, { data: p });
  expect(result.ok()).toBeTruthy();
  const baseline = await result.json();
  await page.goto("/#" + p.id);
  await expect(
    page.getByRole("textbox", { name: "Project name", exact: true }),
  ).toHaveValue(p.name);
  return baseline;
}
for (const width of [1440, 390]) {
  test(`inspecting a take score changes nothing until explicitly selected at ${width}px`, async ({
    page,
  }) => {
    const p = await setup(page, width);
    const jobs = await (await page.request.get("/api/jobs")).json();
    const take = page.locator(".song-take").first();
    await take.getByText("More", { exact: true }).click();
    await take
      .getByRole("button", { name: "Inspect score", exact: true })
      .click();
    await expect(page.getByLabel("Generated ABC preview")).toHaveValue(
      sourceABC,
    );
    await expect(page.getByLabel("Generated ABC preview")).toHaveJSProperty(
      "readOnly",
      true,
    );
    expect(
      await (await page.request.get("/api/projects/" + p.id)).json(),
    ).toEqual(p);
    await page.screenshot({ path: `.runtime/inspect-score-${width}.png` });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    expect(
      await (await page.request.get("/api/projects/" + p.id)).json(),
    ).toEqual(p);
    await take
      .getByRole("button", { name: "Inspect score", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Use this score for next take",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("ABC source")).toHaveValue(sourceABC);
    await expect(
      page.getByLabel("Use saved ABC for next take", { exact: true }),
    ).toBeChecked();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/projects/" + p.id)).json())
            .generation.abc,
      )
      .toBe(sourceABC);
    const changed = await (
      await page.request.get("/api/projects/" + p.id)
    ).json();
    expect(changed.tracks).toEqual(p.tracks);
    expect(changed.candidates).toEqual(p.candidates);
    expect(await (await page.request.get("/api/jobs")).json()).toEqual(jobs);
    await page
      .getByLabel("Use saved ABC for next take", { exact: true })
      .uncheck();
    await expect(page.locator(".model-inputs summary")).toContainText(
      "Saved ABC is off",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  });
  test(`invalid enabled references can be disabled and repaired at ${width}px`, async ({
    page,
  }) => {
    const p = await setup(page, width, true);
    await page
      .locator(".create-steps")
      .getByRole("button", { name: /Performance/ })
      .click();
    await expect(page.locator(".generate-song")).toBeDisabled();
    await expect(page.locator(".guide-forward")).toContainText(
      "enabled ABC reference is empty",
    );
    await page.getByText("Advanced controls", { exact: false }).click();
    const checkbox = page.getByLabel("Use saved ABC for next take", {
      exact: true,
    });
    await expect(checkbox).toBeEnabled();
    await checkbox.uncheck();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/projects/" + p.id)).json())
            .generation.useScore,
      )
      .toBe(false);
    expect(await (await page.request.get("/api/jobs")).json()).toEqual([]);
    await page.locator(".model-inputs summary").click();
    await page
      .getByRole("button", {
        name: "Choose a melody in Piano Roll",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "ABC score", exact: true }).click();
    await page.getByLabel("ABC source").fill(savedABC);
    await page
      .getByLabel("Use saved ABC for next take", { exact: true })
      .check();
    await expect
      .poll(async () => {
        const g = (
          await (await page.request.get("/api/projects/" + p.id)).json()
        ).generation;
        return { enabled: g.useScore, cot: g.cot };
      })
      .toEqual({ enabled: true, cot: "full" });
    expect(await (await page.request.get("/api/jobs")).json()).toEqual([]);
  });
}
