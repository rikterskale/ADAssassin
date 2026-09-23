import { expect, Page, test } from "@playwright/test";
import type { Engagement, GuideResponse } from "../src/types";

// Scope navigation clicks to the sidebar so they never collide with in-content
// links that point at the same routes.
function nav(page: Page) {
  return page.locator("aside.rail");
}

test.describe.configure({ mode: "serial" });

test("operator journey: start here -> overview -> demo -> findings -> vault -> rollback -> report", async ({ page }) => {
  await test.step("First launch opens Start Here before the operational console", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.getByText(/authorized use only/i)).toBeVisible();
    await expect(page.getByText(/engine live/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /from first click to defensible closeout/i }),
    ).toBeVisible();
    await nav(page).getByRole("link", { name: /overview/i }).click();
    await expect(
      page.getByRole("heading", { name: /active directory assessments, one guided step at a time/i }),
    ).toBeVisible();
  });

  await test.step("Explore the offline demo and land on Findings", async () => {
    await page.getByRole("button", { name: /explore the offline demo/i }).click();
    await expect(page).toHaveURL(/\/findings$/);
    // Demo seeds fixture findings; at least one is listed.
    await expect(page.locator("button.finding").first()).toBeVisible();
  });

  await test.step("Findings: inspect, explain, and set a status", async () => {
    await page.locator("button.finding").first().click();
    // Detail pane exposes the explain/remediate action.
    const explain = page.getByRole("button", { name: /explain \+ remediate/i });
    await expect(explain).toBeVisible();
    await explain.click();
    // Explanation section renders after the engine helper returns.
    await expect(page.getByRole("heading", { name: /^explain$/i })).toBeVisible();
    // Marking the finding fixed updates its status locally (no directory write).
    await page.getByRole("button", { name: /^fixed$/i }).click();
    await expect(page.getByText(/status fixed/i)).toBeVisible();
  });

  await test.step("Vault: unmask a secret for its short TTL", async () => {
    await nav(page).getByRole("link", { name: /vault/i }).click();
    await expect(page).toHaveURL(/\/vault$/);
    // Select a secret item (the default selection is public metadata).
    await page.getByRole("button", { name: /Demo NT hash material/i }).click();
    const unmask = page.getByRole("button", { name: /unmask for 30s/i });
    await expect(unmask).toBeEnabled();
    await unmask.click();
    await expect(page.getByRole("heading", { name: /unmasked value/i })).toBeVisible();
  });

  await test.step("Rollback: preview cleanup without contacting a DC", async () => {
    await nav(page).getByRole("link", { name: /rollback/i }).click();
    await expect(page).toHaveURL(/\/rollback$/);
    await expect(page.getByText("ldap-attribute")).toBeVisible();
    await page.getByRole("button", { name: /preview rollback/i }).click();
    await expect(page.getByText(/preview only\. no directory contact/i)).toBeVisible();
  });

  await test.step("Report: generate the export and expose downloads", async () => {
    await nav(page).getByRole("link", { name: /report/i }).click();
    await expect(page).toHaveURL(/\/report$/);
    await page.getByRole("button", { name: /generate report/i }).click();
    await expect(page.getByText(/adassassin engagement report/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /download markdown/i })).toHaveAttribute(
      "href",
      /\/report\.md$/,
    );
    await expect(page.getByRole("link", { name: /download html/i })).toHaveAttribute(
      "href",
      /\/report\.html$/,
    );
    await expect(page.getByRole("link", { name: /download evidence bundle/i })).toHaveAttribute(
      "href",
      /\/bundle\.zip$/,
    );
  });
});

test("reference journey: catalog inspect, glossary, and guided path", async ({ page }) => {
  await test.step("Catalog lists the pinned engine capabilities and inspects one", async () => {
    await page.goto("/catalog");
    await expect(
      page.getByRole("heading", { name: /capabilities from the pinned engine/i }),
    ).toBeVisible();
    const firstRow = page.locator(".picker-row").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page.getByRole("button", { name: /copy id/i })).toBeVisible();
    // Green/offline capabilities are locally runnable without extra live-ad deps.
    await page.getByLabel("Lane filter").selectOption("green");
    await page.locator(".picker-row").first().click();
    await expect(page.locator('a[href^="/run?capability="]')).toBeVisible();
  });

  await test.step("Glossary defines terms", async () => {
    await nav(page).getByRole("link", { name: /glossary/i }).click();
    await expect(page).toHaveURL(/\/glossary$/);
    await expect(page.locator(".finding").first()).toBeVisible();
  });

  await test.step("Guided path shows numbered steps", async () => {
    await nav(page).getByRole("link", { name: /guided/i }).click();
    await expect(page).toHaveURL(/\/guided$/);
    await expect(page.getByRole("heading", { name: /^01 /i })).toBeVisible();
  });
});

test("guided progress follows the selected workspace through delayed responses and retry", async ({ page }, testInfo) => {
  // Synthetic browser responses only; no workspace, target, or evidence is created.
  const workspaces: Engagement[] = ["a", "b"].map((id) => ({
    id, name: `Workspace ${id.toUpperCase()}`, mode: "demo", domain: "", dc: "", username: "",
    notes: "Synthetic guide regression", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    findings: [], jobs: [], connect: null, vault: { secrets: 0, tickets: 0, certificates: 0 },
    rollback: { pending: 0 }, target_contacted: false, guided_marked: [],
  }));
  function guideFor(id: string, title = `Review ${id}`): GuideResponse {
    const next = { id: "demo", title, why: "Offline orientation", href: "/guided",
      complete_when: "demo", completion_mode: "automatic" as const, done: false };
    return { ok: true, engagement_id: id, completed: [], next, steps: [next],
      lanes: { green: 9, yellow: 37, red: 46 }, doctor_summary: "ready", core_complete: false };
  }
  let holdA = false;
  let heldA = false;
  let holdB = false;
  let failB = false;
  let releaseA!: () => void;
  let releaseB!: () => void;
  const waitA = new Promise<void>((resolve) => { releaseA = resolve; });
  const waitB = new Promise<void>((resolve) => { releaseB = resolve; });
  await page.route("**/api/engagements", (route) => route.fulfill({ json: { ok: true, engagements: workspaces } }));
  await page.route("**/api/guide?*", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("engagement_id")!;
    if (id === "a" && holdA) {
      heldA = true;
      await waitA;
      await route.fulfill({ json: guideFor(id, "Obsolete progress") });
    } else if (id === "b" && failB) {
      failB = false;
      await route.fulfill({ status: 503, json: { detail: "Synthetic guide outage" } });
    } else {
      if (id === "b" && holdB) await waitB;
      await route.fulfill({ json: guideFor(id) });
    }
  });

  await page.goto("/guided");
  await expect(page.getByRole("link", { name: "Continue: Review a" })).toBeVisible();
  holdA = true;
  await page.getByRole("button", { name: "Refresh console data" }).click();
  await expect.poll(() => heldA).toBe(true);
  holdB = true;
  const selector = page.getByRole("combobox", { name: "Current engagement" });
  await selector.selectOption("b");
  await expect(page.getByRole("status")).toHaveText(/loading guided progress/i);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /continue:/i })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("guided-loading.png"), fullPage: true, animations: "disabled" });

  releaseB();
  await expect(page.getByRole("link", { name: "Continue: Review b" })).toBeVisible();
  releaseA();
  await expect(page.getByRole("button", { name: "Refresh console data" })).toBeEnabled();
  await expect(selector).toHaveValue("b");
  await expect(page.getByRole("link", { name: "Continue: Review b" })).toBeVisible();
  await expect(page.getByText(/obsolete progress/i)).toHaveCount(0);

  failB = true;
  await page.getByRole("button", { name: "Refresh console data" }).click();
  await expect(page.getByRole("status")).toHaveText(/guided progress is unavailable/i);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /continue:/i })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(nav(page)).not.toBeInViewport();
  const retry = page.getByRole("button", { name: "Retry guided progress" });
  await retry.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(retry).toBeFocused();
  await expect(retry).toHaveCSS("outline-style", "solid");
  await expect(retry).toHaveCSS("outline-width", "2px");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("guided-unavailable-mobile.png"), fullPage: true, animations: "disabled" });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Continue: Review b" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Guided path progress" })).toHaveAttribute("aria-valuemax", "1");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("guided-recovered.png"), fullPage: true, animations: "disabled" });
});
