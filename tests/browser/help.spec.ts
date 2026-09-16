import { test, expect, type Page } from "@playwright/test";
const password = "cadentrail-browser-test";
async function auth(page: Page) {
  expect(
    (await page.request.post("/api/auth", { data: { password } })).ok(),
  ).toBeTruthy();
}
async function setup(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "cadentrail:profile",
      JSON.stringify({ name: "", welcomed: true }),
    );
    localStorage.setItem("studio:experience", "create");
  });
  await auth(page);
  const p = await (
    await page.request.post("/api/projects", {
      data: { name: "Handbook " + width },
    })
  ).json();
  await page.goto("/#" + p.id);
  await expect(
    page.getByRole("textbox", { name: "Project name", exact: true }),
  ).toHaveValue(p.name);
  return p;
}
async function unchanged(page: Page, p: any, jobs: any) {
  expect(
    await (await page.request.get("/api/projects/" + p.id)).json(),
  ).toEqual(p);
  expect(await (await page.request.get("/api/jobs")).json()).toEqual(jobs);
}
async function geometry(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox();
  expect(b).not.toBeNull();
  const size = page.viewportSize()!;
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.y).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(size.width + 1);
  expect(b!.y + b!.height).toBeLessThanOrEqual(size.height + 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}
for (const width of [1440, 390])
  test(
    "first visit explains Create and leaves project intact at " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await auth(page);
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Welcome to Cadentrail." }),
      ).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: /Show me around/ }),
      ).toBeChecked();
      await geometry(page, "dialog.personalization");
      await page.screenshot({ path: ".runtime/044-welcome-" + width + ".png" });
      await page.getByRole("button", { name: /Creation.*guided path/ }).click();
      await expect(page.locator(".tour-card h2")).toHaveText(
        "One song, four small steps",
      );
      const pid = await page.evaluate(() => location.hash.slice(1));
      const p = await (await page.request.get("/api/projects/" + pid)).json(),
        jobs = await (await page.request.get("/api/jobs")).json();
      for (let step = 0; step < 7; step++) {
        await expect(page.locator(".tour-count")).toHaveText(
          "STEP " + (step + 1) + " OF 7",
        );
        await geometry(page, ".tour-card");
        await expect(page.locator(".tour-spotlight")).toBeVisible();
        expect(
          await page
            .locator(".tour-layer")
            .evaluate(
              (el) => getComputedStyle(el, "::backdrop").backdropFilter,
            ),
        ).toBe("none");
        if (step === 2 || step === 3)
          await page.screenshot({
            path: ".runtime/044-create-tour-" + width + "-" + step + ".png",
          });
        if (step < 6)
          await page.getByRole("button", { name: "Next", exact: true }).click();
      }
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "What does your song feel like?" }),
      ).toBeVisible();
      await unchanged(page, p, jobs);
      await page
        .getByRole("button", { name: "Handbook and tours", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Replay tour", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close handbook" }).click();
      await page.reload();
      await expect(page.locator(".tour-card")).toHaveCount(0);
      await expect(page.locator("dialog.personalization")).toHaveCount(0);
    },
  );

for (const width of [1440, 390])
  test(
    "handbook search, keyboard focus and tour resumption at " + width + "px",
    async ({ page }) => {
      const p = await setup(page, width),
        jobs = await (await page.request.get("/api/jobs")).json();
      await page.getByRole("button", { name: "Step 2: Words" }).click();
      await page.keyboard.press("F1");
      await expect(
        page.getByRole("heading", { name: "Cadentrail handbook" }),
      ).toBeVisible();
      await page
        .getByRole("searchbox", { name: "Search handbook" })
        .fill("duet timing");
      await page
        .getByRole("button", { name: /Correct lyric timing and duets/ })
        .click();
      await expect(page.locator(".handbook-reading h1")).toHaveText(
        "Correct lyric timing and duets",
      );
      await geometry(page, "dialog.handbook");
      await page.screenshot({
        path: ".runtime/044-handbook-" + width + ".png",
      });
      await page
        .getByRole("button", { name: "Start tour", exact: true })
        .click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page
        .getByRole("button", { name: "Finish later", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Give it a story." }),
      ).toBeVisible();
      await page.reload();
      await expect(page.locator(".tour-card")).toHaveCount(0);
      const trigger = page.getByRole("button", {
        name: "Handbook and tours",
        exact: true,
      });
      await trigger.click();
      await page
        .getByRole("button", { name: "Resume tour", exact: true })
        .click();
      await expect(page.locator(".tour-card h2")).toHaveText(
        "Describe what you want to hear",
      );
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(".tour-card h2")).toHaveText(
        "Give the song its words",
      );
      await page.getByRole("button", { name: "Read the full guide" }).click();
      await expect(page.locator(".handbook-reading h1")).toHaveText(
        "Lyrics, writers and vocal roles",
      );
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await unchanged(page, p, jobs);
    },
  );

test("welcome can skip the tour and help works with no project", async ({
  page,
}) => {
  await auth(page);
  await page.goto("/");
  await page.getByRole("checkbox", { name: /Show me around/ }).uncheck();
  await page.getByRole("button", { name: /Listen.*saved music/ }).click();
  await expect(page.locator(".listening-room")).toBeVisible();
  await expect(page.locator(".tour-card")).toHaveCount(0);
  await page
    .locator(".listening-room")
    .getByRole("button", { name: "Handbook and tours" })
    .click();
  await expect(page.locator(".handbook-reading h1")).toHaveText(
    "Use the listening room",
  );
  await page.getByRole("button", { name: "Start tour", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".listening-room")).toBeVisible();
});

for (const width of [1440, 390])
  test(
    "Studio tour restores the editor without changing music at " + width + "px",
    async ({ page }) => {
      const p = await setup(page, width),
        jobs = await (await page.request.get("/api/jobs")).json();
      if (width === 390) {
        await page.locator('summary[aria-label="More workspaces"]').click();
        await page
          .getByRole("button", { name: "Open Studio", exact: true })
          .click();
      } else
        await page.getByRole("button", { name: "Studio", exact: true }).click();
      await page.getByRole("button", { name: "Mix", exact: true }).click();
      await page
        .getByRole("button", { name: "Handbook and tours", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Start tour", exact: true })
        .click();
      for (let i = 0; i < 6; i++) {
        await expect(page.locator(".tour-count")).toHaveText(
          "STEP " + (i + 1) + " OF 6",
        );
        await geometry(page, ".tour-card");
        await expect(page.locator(".tour-spotlight")).toBeVisible();
        await expect(page.locator(".tour-unavailable")).toHaveCount(0);
        if (i === 3)
          await page.screenshot({
            path: ".runtime/044-studio-tour-" + width + ".png",
          });
        if (i < 5)
          await page.getByRole("button", { name: "Next", exact: true }).click();
      }
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page.locator(".workspace-tabs button.active")).toHaveText(
        "Mix",
      );
      await unchanged(page, p, jobs);
      await page.getByRole("button", { name: "Visuals", exact: true }).click();
      await page
        .getByRole("button", { name: "Handbook and tours", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Start tour", exact: true })
        .click();
      await expect(page.locator(".tour-card h2")).toHaveText(
        "Visuals belongs to your song",
      );
      await page.keyboard.press("Escape");
      await unchanged(page, p, jobs);
    },
  );

test("Radio keeps broadcasting and playing while the handbook and tour are open", async ({
  page,
}) => {
  await setup(page, 390);
  const station = await (await page.request.post("/api/_test/radio")).json();
  await page.getByRole("button", { name: "Radio", exact: true }).click();
  const room = page.locator(".radio-room");
  await expect(
    room.getByRole("heading", { name: "Radio browser check 1" }),
  ).toBeVisible();
  const playing = () =>
    page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLAudioElement>('[data-player="radio"]'),
      ).some((a) => !a.paused && a.currentTime > 12),
    );
  await expect.poll(playing).toBeTruthy();
  await room.getByRole("button", { name: "Handbook and tours" }).click();
  await expect(page.locator(".handbook-reading h1")).toHaveText(
    "Start and change a live Radio station",
  );
  await page.getByRole("button", { name: "Start tour", exact: true }).click();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(playing).toBeTruthy();
  await page.screenshot({ path: ".runtime/044-radio-tour-390.png" });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const current = await (await page.request.get("/api/radio/current")).json();
  expect(current.id).toBe(station.id);
  expect(current.revision).toBe(station.revision);
  expect(current.tracks[0].startedAt).toBe(station.tracks[0].startedAt);
  await page.getByRole("button", { name: "Stop Radio", exact: true }).click();
});

test("handbook remains usable in fullscreen Listen and with reduced motion", async ({
  page,
}) => {
  await setup(page, 1440);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBeTruthy();
  const room = page.locator(".listening-room");
  await room.getByRole("button", { name: "Handbook and tours" }).click();
  await expect(page.locator(".handbook")).toBeVisible();
  expect(
    await page
      .locator(".handbook")
      .evaluate((el) => document.fullscreenElement?.contains(el)),
  ).toBe(true);
  await page.getByRole("button", { name: "Start tour", exact: true }).click();
  await expect(page.locator(".tour-spotlight")).toBeVisible();
  expect(
    await page
      .locator(".tour-spotlight")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await page.getByRole("button", { name: "Finish later", exact: true }).click();
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBeFalsy();
});

test("a failed help chunk keeps the project usable", async ({ page }) => {
  const p = await setup(page, 390);
  await page.route("**/assets/HelpWindow-*.js", (route) => route.abort());
  await page
    .getByRole("button", { name: "Handbook and tours", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Handbook unavailable", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue working", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Project name", exact: true }),
  ).toHaveValue(p.name);
  await expect(
    page.getByRole("heading", {
      name: "The workstation encountered an error.",
    }),
  ).toHaveCount(0);
});

test.afterEach(async ({ page }) => {
  await page.request.post("/api/_test/reset-signin");
});
