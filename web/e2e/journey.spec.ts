import { expect, Page, test } from "@playwright/test";

// Scope navigation clicks to the sidebar so they never collide with in-content
// links that point at the same routes.
function nav(page: Page) {
  return page.locator("aside.rail");
}

test.describe.configure({ mode: "serial" });

test("operator journey: overview -> demo -> findings -> vault -> rollback -> report", async ({ page }) => {
  await test.step("Overview loads with the authorized banner and a live engine", async () => {
    await page.goto("/");
    await expect(page.getByText(/authorized use only/i)).toBeVisible();
    await expect(page.getByText(/engine live/i)).toBeVisible();
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
    // Inspector offers a run link for the selected capability.
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
