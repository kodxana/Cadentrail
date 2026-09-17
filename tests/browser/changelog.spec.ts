import { test, expect, type Page } from "@playwright/test";
async function prepare(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "cadentrail:profile",
      JSON.stringify({ name: "", welcomed: true }),
    );
    localStorage.setItem("studio:experience", "create");
  });
  await page.request.post("/api/auth", {
    data: { password: "cadentrail-browser-test" },
  });
  return await (await page.request.post("/api/_test/takes")).json();
}
test.afterEach(async ({ page }) => {
  await page.request.post("/api/_test/reset-signin");
});
for (const width of [1440, 390]) {
  test(
    "changelog search, history and handbook return at " + width,
    async ({ page }) => {
      const p = await prepare(page, width);
      const before = await (
        await page.request.get("/api/projects/" + p.id)
      ).json();
      const jobs = await (await page.request.get("/api/jobs")).json();
      await page.goto("/#" + p.id);
      const trigger = page.getByRole("button", {
        name: "Handbook and tours",
        exact: true,
      });
      await trigger.click();
      const book = page.getByRole("dialog", {
        name: "Cadentrail handbook",
        exact: true,
      });
      const chapter = await book.locator("main article h1").innerText();
      await book
        .getByRole("button", { name: "What's new", exact: true })
        .click();
      const changes = page.getByRole("dialog", {
        name: "What's new",
        exact: true,
      });
      await expect(
        changes.getByRole("heading", {
          name: "Clearer Studio workflows",
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: ".runtime/0412-changelog-" + width + ".png",
        animations: "disabled",
      });
      if (width === 390)
        await changes
          .getByLabel("Release version", { exact: true })
          .selectOption("0.3.7");
      else
        await changes
          .getByRole("navigation", { name: "Release versions" })
          .getByRole("button", { name: /0.3.7/ })
          .click();
      await expect(
        changes.getByRole("article", { name: "Release 0.3.7", exact: true }),
      ).toContainText("Live scrolling lyrics");
      await changes.getByLabel("Search updates").fill("Japanese");
      await expect(changes.getByRole("article")).toContainText(
        "Instrumentals and melody guidance",
      );
      await changes.getByLabel("Search updates").fill("0.3.6");
      await changes.getByLabel("Change type").selectOption("Fixed");
      await expect(
        changes.getByRole("heading", { name: "Fixed", exact: true }),
      ).toBeVisible();
      await expect(
        changes.getByRole("heading", { name: "Improved", exact: true }),
      ).toHaveCount(0);
      await changes.getByLabel("Search updates").fill("nothing-matches-this");
      await expect(
        changes.getByRole("heading", { name: "No matching updates" }),
      ).toBeVisible();
      await changes.getByRole("button", { name: "Clear filters" }).click();
      await changes.getByRole("button", { name: "Guide", exact: true }).click();
      await expect(book.locator("main article h1")).toHaveText(chapter);
      await book.getByRole("button", { name: "Close handbook" }).click();
      await expect(trigger).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(
        await (await page.request.get("/api/projects/" + p.id)).json(),
      ).toEqual(before);
      expect(await (await page.request.get("/api/jobs")).json()).toEqual(jobs);
    },
  );
  test(
    "changelog entry in listening rooms and version deep link at " + width,
    async ({ page }) => {
      const p = await prepare(page, width);
      await page.goto("/#" + p.id);
      for (const mode of ["Listen", "Radio"]) {
        await page.getByRole("button", { name: mode, exact: true }).click();
        const room = page.getByRole("region", {
          name: mode === "Listen" ? "Listening mode" : "Radio mode",
          exact: true,
        });
        await expect(room).toBeVisible();
        await room
          .getByRole("button", { name: "Handbook and tours", exact: true })
          .click();
        await page
          .getByRole("dialog", { name: "Cadentrail handbook", exact: true })
          .getByRole("button", { name: "What's new", exact: true })
          .click();
        const changes = page.getByRole("dialog", {
          name: "What's new",
          exact: true,
        });
        await expect(changes.getByLabel("Search updates")).toBeVisible();
        await changes.getByRole("button", { name: "Close changelog" }).click();
        await expect(room).toBeVisible();
      }
      await page.goto("/?changelog=0.4.10#" + p.id);
      await expect(
        page
          .getByRole("dialog", { name: "What's new", exact: true })
          .getByRole("article", { name: "Release 0.4.10" }),
      ).toContainText("Bring your own agent");
    },
  );
}
test("About opens changelog without stacking dialogs", async ({ page }) => {
  const p = await prepare(page, 1440);
  await page.goto("/#" + p.id);
  await page
    .getByRole("button", { name: "About Cadentrail", exact: true })
    .click();
  await page
    .getByRole("button", { name: "What's new · Changelog", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("dialog", { name: "What's new", exact: true }),
  ).toBeVisible();
});
