import { expect, test } from "@playwright/test";

// The console's core safety promise: destructive / side-effect (RED) capabilities
// are never one-click. They require typing the capability id to confirm. This is
// verified through the real GUI, against a real RED capability from the pinned
// engine, without actually executing anything (no directory is contacted).
test("RED capabilities require typing the id to confirm before running", async ({ page, request }) => {
  const catalog = await (await request.get("/api/catalog")).json();
  const red = catalog.capabilities.find(
    (c: { lane: string; runnable?: boolean; readiness?: { ready: boolean }; approval?: string }) =>
      c.lane === "red"
      && (c.readiness?.ready ?? c.runnable ?? false)
      && c.approval !== "scoped_token",
  ) as { id: string } | undefined;
  expect(red, "the local engine should expose a ready RED capability").toBeTruthy();
  const id = red!.id;

  // Demo workspaces remain permanently offline, even when RED confirmation is exact.
  await page.goto("/");
  await page.getByRole("button", { name: /explore the offline demo/i }).click();
  await expect(page).toHaveURL(/\/findings$/);
  await page.goto(`/run?capability=${encodeURIComponent(id)}`);
  await expect(page.getByText(/this run is/i)).toBeVisible();
  await expect(page.getByText(/offline demo engagements can run green capabilities only/i)).toBeVisible();
  await page.getByPlaceholder(`Type ${id}`).fill(id);
  await expect(page.locator('form button[type="submit"]')).toBeDisabled();

  // Create an offline, live-ready workspace solely to exercise the UI gate.
  // No connect or run request is submitted, so no directory can be contacted.
  await page.goto("/engagements");
  await page.getByPlaceholder("Name").fill("E2E confirmation gate");
  await page.getByPlaceholder("Scope notes").fill("Offline UI safety-gate verification only.");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(/e2e confirmation gate/i)).toBeVisible();
  await page.goto(`/run?capability=${encodeURIComponent(id)}`);

  // The run button stays disabled until the id is typed exactly.
  const confirm = page.getByPlaceholder(`Type ${id}`);
  await expect(confirm).toBeVisible();
  const submit = page.locator('form button[type="submit"]');
  await expect(submit).toBeDisabled();
  await confirm.fill(id);
  await expect(submit).toBeEnabled();

  // A wrong confirmation re-disables it.
  await confirm.fill(`${id}-wrong`);
  await expect(submit).toBeDisabled();
});
