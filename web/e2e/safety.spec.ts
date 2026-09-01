import { expect, test } from "@playwright/test";

// The console's core safety promise: destructive / side-effect (RED) capabilities
// are never one-click. They require typing the capability id to confirm. This is
// verified through the real GUI, against a real RED capability from the pinned
// engine, without actually executing anything (no directory is contacted).
test("RED capabilities require typing the id to confirm before running", async ({ page, request }) => {
  const catalog = await (await request.get("/api/catalog")).json();
  const red = catalog.capabilities.find(
    (c: { lane: string }) => c.lane === "red",
  ) as { id: string } | undefined;
  expect(red, "the pinned catalog should expose at least one RED capability").toBeTruthy();
  const id = red!.id;

  // A current engagement is needed for the Run form; the offline demo provides one.
  await page.goto("/");
  await page.getByRole("button", { name: /explore the offline demo/i }).click();
  await expect(page).toHaveURL(/\/findings$/);

  await page.goto(`/run?capability=${encodeURIComponent(id)}`);

  // RED warning + typed-confirm input are present.
  await expect(page.getByText(/this run is/i)).toBeVisible();
  const confirm = page.getByPlaceholder(`Type ${id}`);
  await expect(confirm).toBeVisible();

  // The run button stays disabled until the id is typed exactly.
  const submit = page.locator('form button[type="submit"]');
  await expect(submit).toBeDisabled();
  await confirm.fill(id);
  await expect(submit).toBeEnabled();

  // A wrong confirmation re-disables it.
  await confirm.fill(`${id}-wrong`);
  await expect(submit).toBeDisabled();
});
