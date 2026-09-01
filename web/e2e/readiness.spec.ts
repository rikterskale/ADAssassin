import { expect, test } from "@playwright/test";

// Backend readiness: the API surface a user's console depends on must be live,
// offline-safe, and bound to localhost before we trust the GUI journey.
test.describe("backend readiness", () => {
  test("health reports a live engine and full catalog on localhost", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.product).toBe("adassassin");
    expect(body.version).toMatch(/^0\.7\./);
    expect(body.engine.available).toBe(true);
    expect(body.catalog_count).toBeGreaterThanOrEqual(90);
    expect(body.bind).toMatch(/^127\.0\.0\.1:/);
  });

  test("doctor passes offline and never contacts a directory", async ({ request }) => {
    const res = await request.get("/api/doctor");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.contacts_directory).toBe(false);
    expect(body.ok).toBe(true);
  });

  test("catalog and glossary are populated", async ({ request }) => {
    const catalog = await (await request.get("/api/catalog")).json();
    expect(catalog.count).toBeGreaterThanOrEqual(90);
    expect(Array.isArray(catalog.capabilities)).toBeTruthy();
    const glossary = await (await request.get("/api/glossary")).json();
    expect(glossary.items.length).toBeGreaterThan(0);
  });

  test("the SPA is served and deep links fall back to index.html", async ({ request }) => {
    const root = await request.get("/");
    expect(root.ok()).toBeTruthy();
    expect(await root.text()).toContain('<div id="root">');
    // A client-side route path must still return the SPA shell, not a 404.
    const deep = await request.get("/report");
    expect(deep.ok()).toBeTruthy();
    expect(await deep.text()).toContain('<div id="root">');
  });

  test("static serving rejects path traversal", async ({ request }) => {
    const res = await request.get("/../pyproject.toml");
    // Either blocked, or safely rewritten to the SPA shell — never the file.
    const text = await res.text();
    expect(text).not.toContain("[build-system]");
  });
});
