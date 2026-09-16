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
for (const width of [1440, 390])
  test(`agent setup, scoped access and revocation at ${width}px`, async ({
    page,
  }) => {
    const p = await prepare(page, width);
    await page.goto("/#" + p.id);
    await page
      .locator(".creation-utilities")
      .getByRole("button", { name: "API & Integrations", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "API & Integrations",
      exact: true,
    });
    await expect(
      dialog.getByRole("heading", { name: "Connect your creative assistant" }),
    ).toBeVisible();
    await expect(
      dialog.getByText("bearer_token_env_var", { exact: false }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Access tokens", exact: true })
      .click();
    const name = "Browser agent " + width;
    await dialog.getByLabel("Connection name").fill(name);
    await dialog.getByRole("button", { name: "Reader", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Create access token", exact: true })
      .click();
    await expect(
      dialog.getByText("Save this token now — it is shown once."),
    ).toBeVisible();
    const secret = await dialog.locator(".integration-secret pre").innerText();
    const issued = (
      await (await page.request.get("/api/integrations/tokens")).json()
    ).find((x: { name: string }) => x.name === name);
    try {
      expect(
        (
          await page.request.post("/api/projects", {
            headers: { Authorization: "Bearer " + secret },
            data: { name: "Denied" },
          })
        ).status(),
      ).toBe(403);
      await dialog
        .getByRole("button", { name: "Test connection", exact: true })
        .click();
      await expect(
        dialog.getByText("Connected as " + name + ". Permissions verified."),
      ).toBeVisible();
      expect(
        await page.evaluate(
          (t) => Object.values(localStorage).some((x) => x.includes(t)),
          secret,
        ),
      ).toBe(false);
      await dialog
        .getByRole("button", { name: "I saved my token", exact: true })
        .click();
      await expect(dialog.locator(".integration-secret")).toHaveCount(0);
      await dialog
        .getByRole("button", { name: "Activity", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await expect(dialog.locator(".integration-activity")).toContainText(name);
      await dialog
        .getByRole("button", { name: "API reference", exact: true })
        .click();
      await dialog.getByLabel("Find an endpoint").fill("/api/jobs/{job_id}");
      await dialog
        .locator(".integration-endpoints")
        .getByRole("button")
        .filter({ hasText: "Read progress, result" })
        .click();
      await expect(dialog.locator(".integration-endpoint")).toContainText(
        "Job",
      );
      expect(
        await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBeTruthy();
      await page.screenshot({
        path: `.runtime/047-api-reference-${width}.png`,
        animations: "disabled",
      });
      await dialog
        .getByRole("button", { name: "Access tokens", exact: true })
        .click();
      const connection = dialog
        .locator(".integration-token-list article")
        .filter({ hasText: name });
      await connection
        .getByRole("button", { name: "Revoke", exact: true })
        .click();
      await connection
        .getByRole("button", { name: "Confirm revoke", exact: true })
        .click();
      await expect(connection).toContainText("Revoked");
      expect(
        (
          await page.request.get("/api/projects", {
            headers: { Authorization: "Bearer " + secret },
          })
        ).status(),
      ).toBe(401);
    } finally {
      await page.request.delete("/api/integrations/tokens/" + issued.id);
    }
    await dialog
      .getByRole("button", { name: "Close API & Integrations" })
      .click();
    expect(new URL(page.url()).hash).toBe("#" + p.id);
  });
for (const width of [1440, 390])
  test(`integrations deep link and Listen/Radio entries at ${width}px`, async ({
    page,
  }) => {
    const p = await prepare(page, width);
    await page.goto("/?integrations=1#" + p.id);
    const dialog = page.getByRole("dialog", {
      name: "API & Integrations",
      exact: true,
    });
    await expect(
      dialog.getByRole("heading", { name: "Connect your creative assistant" }),
    ).toBeVisible();
    await page.screenshot({
      path: `.runtime/047-api-connect-${width}.png`,
      animations: "disabled",
    });
    await dialog
      .getByRole("button", { name: "Close API & Integrations" })
      .click();
    await page
      .locator(".creation-header")
      .getByRole("button", { name: "Listen", exact: true })
      .click();
    await page
      .locator(".listening-utilities")
      .getByRole("button", { name: "API & Integrations", exact: true })
      .click();
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Close API & Integrations" })
      .click();
    await page
      .locator(".listening-room-header")
      .getByRole("button", { name: "Radio", exact: true })
      .click();
    await page
      .locator(".radio-room")
      .getByRole("button", { name: "API & Integrations", exact: true })
      .click();
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Agent guide", exact: true })
      .click();
    await expect(
      dialog.getByText("From a request to a finished asset"),
    ).toBeVisible();
    expect((await page.request.get("/api/radio/current")).ok()).toBeTruthy();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  });

for (const width of [1440, 390])
  test(
    "Runpod companion setup, brief and download at " + width + "px",
    async ({ page }) => {
      const p = await prepare(page, width);
      const before = await (
        await page.request.get("/api/projects/" + p.id)
      ).json();
      const jobs = await (await page.request.get("/api/jobs")).json();
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto("/?integrations=runpod#" + p.id);
      const dialog = page.getByRole("dialog", {
        name: "API & Integrations",
        exact: true,
      });
      await expect(
        dialog.getByRole("heading", {
          name: "A new Pod. The same connection.",
        }),
      ).toBeVisible();
      await expect(dialog.getByRole("button", {name:"Reconnect MCP",exact:true})).toHaveAttribute("aria-pressed","true");
      const session=await (await page.request.get("/api/session")).json();
      await dialog.getByRole("button",{name:"Copy agent brief",exact:true}).click();
      expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain(session.workstationId);
      const kitPromise=page.waitForEvent("download");
      await dialog.getByRole("link",{name:"Download reconnect kit",exact:true}).click();
      const kit=await kitPromise;
      expect(kit.suggestedFilename()).toBe("cadentrail-runpod-reconnect.zip");
      expect(await kit.failure()).toBeNull();
      await dialog.locator(".integration-content").evaluate(e => {e.scrollTop=0;});
      await page.screenshot({path:".runtime/049-reconnect-"+width+".png",animations:"disabled"});
      await dialog.locator("summary").filter({hasText:"Set up Runpod skills and the companion"}).click();
      await expect(
        dialog.getByRole("link", {
          name: "Official Runpod installation guide",
        }),
      ).toHaveAttribute(
        "href",
        "https://github.com/runpod/runpod-plugins-official#install",
      );
      await page.screenshot({
        path: ".runtime/049-runpod-" + width + ".png",
        animations: "disabled",
      });
      const downloadPromise = page.waitForEvent("download");
      await dialog
        .getByRole("link", { name: "Download SKILL.md", exact: true })
        .click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("SKILL.md");
      expect(await download.failure()).toBeNull();
      await dialog
        .getByRole("button", { name: "Create music", exact: true })
        .click();
      await dialog
        .getByLabel("Your request")
        .fill("Read only: inspect Japanese lyric assistance.");
      await dialog
        .getByRole("button", { name: "Copy agent brief", exact: true })
        .click();
      const brief = await page.evaluate(() => navigator.clipboard.readText());
      expect(brief).toContain("http://127.0.0.1:8014/api/mcp");
      expect(brief).toContain("Read only: inspect Japanese lyric assistance.");
      expect(brief).not.toContain(p.id);
      await dialog
        .locator("summary")
        .filter({ hasText: "Where to save it" })
        .click();
      await expect(
        dialog.getByText("~/.agents/skills/cadentrail-runpod/SKILL.md", {
          exact: true,
        }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Claude Code", exact: true })
        .click();
      await expect(
        dialog.getByText("~/.claude/skills/cadentrail-runpod/SKILL.md", {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBeTruthy();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBeTruthy();
      expect(
        await (await page.request.get("/api/projects/" + p.id)).json(),
      ).toEqual(before);
      expect(await (await page.request.get("/api/jobs")).json()).toEqual(jobs);
      await dialog
        .getByRole("button", { name: "Open connection setup", exact: true })
        .click();
      await expect(
        dialog.getByRole("heading", {
          name: "Connect your creative assistant",
        }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Pair with official Runpod skills" })
        .click();
      await expect(
        dialog.getByRole("heading", {
          name: "A new Pod. The same connection.",
        }),
      ).toBeVisible();
    },
  );
