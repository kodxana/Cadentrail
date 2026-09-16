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
    "bring your own agent setup and task at " + width + "px",
    async ({ page }) => {
      const p = await prepare(page, width);
      const before = await (
        await page.request.get("/api/projects/" + p.id)
      ).json();
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto("/#" + p.id);
      const entry = page.getByRole("button", { name: "Agents", exact: true });
      await expect(entry).toBeVisible();
      await expect(entry).toContainText("Agents");
      await entry.click();
      const guide = page.getByRole("dialog", { name: "Agents", exact: true });
      await expect(
        guide.getByRole("heading", { name: "Bring your own agent" }),
      ).toBeVisible();
      await guide
        .getByRole("button", {
          name: "Claude Code Use your existing assistant",
          exact: true,
        })
        .click();
      await page.screenshot({
        path: ".runtime/0410-agents-" + width + ".png",
        animations: "disabled",
      });
      await guide
        .getByRole("button", { name: "Choose access", exact: true })
        .click();
      const api = page.getByRole("dialog", {
        name: "API & Integrations",
        exact: true,
      });
      await expect(
        api.getByRole("heading", { name: "Give each agent its own key" }),
      ).toBeVisible();
      await api
        .getByRole("button", { name: "Back to Agents", exact: true })
        .click();
      await expect(
        guide.getByRole("button", {
          name: "Claude Code Use your existing assistant",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await guide
        .getByRole("button", { name: "Set up Claude Code", exact: true })
        .click();
      await expect(
        api.getByRole("button", { name: "Claude Code", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(api.locator(".integration-code")).toContainText(
        "mcpServers",
      );
      await api
        .getByRole("button", { name: "Back to Agents", exact: true })
        .click();
      await guide
        .getByRole("button", { name: "Choose a starting task", exact: true })
        .click();
      await guide
        .getByLabel("Your direction")
        .fill("Write a hopeful Japanese chorus.");
      await guide
        .getByRole("button", { name: "Copy task for my agent", exact: true })
        .click();
      const task = await page.evaluate(() => navigator.clipboard.readText());
      expect(task).toContain(p.id);
      expect(task).toContain("Write a hopeful Japanese chorus.");
      expect(task).not.toContain("Bearer ");
      await guide
        .getByRole("button", { name: "API documentation", exact: true })
        .click();
      await expect(api.getByLabel("Find an endpoint")).toBeVisible();
      await api
        .getByRole("button", { name: "Back to Agents", exact: true })
        .click();
      await expect(guide.getByLabel("Your direction")).toHaveValue(
        "Write a hopeful Japanese chorus.",
      );
      expect(
        await guide.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBeTruthy();
      await guide
        .getByRole("button", { name: "Close Agents", exact: true })
        .click();
      await expect(entry).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBeTruthy();
      expect(
        await (await page.request.get("/api/projects/" + p.id)).json(),
      ).toEqual(before);
    },
  );
  test(
    "Agents opens in Listen and Radio with accurate connection history at " +
      width +
      "px",
    async ({ page }) => {
      const p = await prepare(page, width);
      const token = await (
        await page.request.post("/api/integrations/tokens", {
          data: {
            name: "Guide connection " + width,
            scopes: ["read"],
            expiresDays: 1,
          },
        })
      ).json();
      try {
        await page.goto("/#" + p.id);
        for (const mode of ["Listen", "Radio"]) {
          await page.getByRole("button", { name: mode, exact: true }).click();
          const room = page.getByRole("region", {name: mode === "Listen" ? "Listening mode" : "Radio mode", exact: true});
          await expect(room).toBeVisible();
          await room.getByRole("button", { name: "Agents", exact: true }).click();
          const guide = page.getByRole("dialog", {
            name: "Agents",
            exact: true,
          });
          await guide
            .getByRole("button", { name: "My connections", exact: true })
            .click();
          const row = guide
            .locator(".agents-connections article")
            .filter({ hasText: token.name });
          await expect(row).toContainText("not used yet");
          await guide
            .getByRole("button", { name: "Close Agents", exact: true })
            .click();
          await page.screenshot({path: ".runtime/0410-" + mode.toLowerCase() + "-" + width + ".png", animations:"disabled"});
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          ).toBeTruthy();
        }
        await page.goto("/?agents=reconnect#" + p.id);
        await expect(
          page
            .getByRole("dialog", { name: "Agents", exact: true })
            .getByRole("heading", { name: "A new Pod. The same connection." }),
        ).toBeVisible();
      } finally {
        await page.request.delete("/api/integrations/tokens/" + token.id);
      }
    },
  );
}
test("instrumental guidance preserves unsaved project work", async ({
  page,
}) => {
  const p = await prepare(page, 390);
  const project = await (
    await page.request.get("/api/projects/" + p.id)
  ).json();
  project.generation.role = "instrumental";
  await page.request.put("/api/projects/" + p.id, { data: project });
  await page.goto("/#" + p.id);
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Agents", exact: true });
  await guide
    .getByRole("button", { name: "Give it a task", exact: true })
    .click();
  await expect(
    guide.getByRole("button", { name: /Shape an instrumental/ }),
  ).toBeVisible();
  await expect(
    guide.getByRole("button", { name: /Write lyrics together/ }),
  ).toHaveCount(0);
  await guide
    .getByRole("button", { name: "Close Agents", exact: true })
    .click();
  let unblock: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  await page.route("**/api/projects/" + p.id, async (route) => {
    if (route.request().method() === "PUT") await pending;
    await route.continue();
  });
  try {
    await page
      .getByRole("textbox", { name: "Project name", exact: true })
      .fill("Unsaved instrumental name");
    await page.getByRole("button", { name: "Agents", exact: true }).click();
    await expect(
      guide.getByText("Save your project first", { exact: true }),
    ).toBeVisible();
    await expect(
      guide.getByRole("button", {
        name: "Copy task for my agent",
        exact: true,
      }),
    ).toHaveCount(0);
    await guide
      .getByRole("button", { name: "Return to project", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Project name", exact: true }),
    ).toHaveValue("Unsaved instrumental name");
  } finally {
    unblock();
  }
});
