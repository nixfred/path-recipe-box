import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/index";
import { openDb } from "../src/db";

let dir: string;
let db: ReturnType<typeof openDb>;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "recipe-box-app-"));
  db = openDb(join(dir, "test.sqlite"));
  app = createApp(db);
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const json = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const form = (path: string, fields: Record<string, string>) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

test("GET /health", async () => {
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("GET /api/recipes lists the seeded recipes", async () => {
  const res = await app.request("/api/recipes");
  expect(res.status).toBe(200);
  const list = (await res.json()) as { title: string }[];
  expect(list.length).toBeGreaterThanOrEqual(3);
});

test("API create, read, update, delete", async () => {
  const created = await json("POST", "/api/recipes", {
    title: "API Toast",
    ingredients: ["bread", "butter"],
    tags: "Breakfast, TOAST",
    prep_minutes: 5,
  });
  expect(created.status).toBe(201);
  const recipe = (await created.json()) as { id: number; tags: string; ingredients: string };
  expect(recipe.tags).toBe("breakfast,toast");
  expect(recipe.ingredients).toBe("bread\nbutter");

  const got = await app.request(`/api/recipes/${recipe.id}`);
  expect(got.status).toBe(200);

  const put = await json("PUT", `/api/recipes/${recipe.id}`, { title: "API Toast v2" });
  expect(put.status).toBe(200);
  expect(((await put.json()) as { title: string }).title).toBe("API Toast v2");

  const del = await json("DELETE", `/api/recipes/${recipe.id}`);
  expect(del.status).toBe(200);
  expect((await app.request(`/api/recipes/${recipe.id}`)).status).toBe(404);
});

test("API validation: missing title is 400 with an error message", async () => {
  const res = await json("POST", "/api/recipes", { description: "no title" });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toContain("Title");
});

test("API validation: bad numbers and bad JSON are 400", async () => {
  expect((await json("POST", "/api/recipes", { title: "x", servings: "lots" })).status).toBe(400);
  const bad = await app.request("/api/recipes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  expect(bad.status).toBe(400);
});

test("API 404 for missing recipes", async () => {
  expect((await app.request("/api/recipes/99999")).status).toBe(404);
  expect((await json("PUT", "/api/recipes/99999", { title: "x" })).status).toBe(404);
  expect((await json("DELETE", "/api/recipes/99999")).status).toBe(404);
  expect((await app.request("/api/recipes/abc")).status).toBe(404);
});

test("API search and tag filter", async () => {
  await json("POST", "/api/recipes", { title: "Searchable Dumplings", tags: "dumpling-night" });
  const byQ = (await (await app.request("/api/recipes?q=dumplings")).json()) as unknown[];
  expect(byQ).toHaveLength(1);
  const byTag = (await (await app.request("/api/recipes?tag=dumpling-night")).json()) as unknown[];
  expect(byTag).toHaveLength(1);
});

test("home page lists recipes and has a search box", async () => {
  const res = await app.request("/");
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).toContain("Fluffy Pancakes");
  expect(text).toContain('name="q"');
});

test("form create redirects (303) to the new recipe page", async () => {
  const res = await form("/recipes", { title: "Form Pie", tags: "dessert" });
  expect(res.status).toBe(303);
  const location = res.headers.get("location")!;
  expect(location).toMatch(/^\/recipes\/\d+$/);
  const page = await app.request(location);
  expect(await page.text()).toContain("Form Pie");
});

test("form create with no title shows the form again with an error", async () => {
  const res = await form("/recipes", { title: "   ", description: "kept" });
  expect(res.status).toBe(400);
  const text = await res.text();
  expect(text).toContain("Title is required");
  expect(text).toContain("kept");
});

test("a title containing a script tag is escaped, never rendered as HTML", async () => {
  const evil = "<script>alert('xss')</script>";
  const res = await form("/recipes", { title: evil });
  const page = await (await app.request(res.headers.get("location")!)).text();
  expect(page).not.toContain(evil);
  expect(page).toContain("&lt;script&gt;");
  const home = await (await app.request("/")).text();
  expect(home).not.toContain(evil);
});

test("edit form is prefilled and update redirects", async () => {
  const made = await form("/recipes", { title: "Edit Me" });
  const location = made.headers.get("location")!;
  const edit = await (await app.request(`${location}/edit`)).text();
  expect(edit).toContain('value="Edit Me"');
  const updated = await form(location, { title: "Edited" });
  expect(updated.status).toBe(303);
  expect(await (await app.request(location)).text()).toContain("Edited");
});

test("delete via form removes the recipe", async () => {
  const made = await form("/recipes", { title: "Delete Me" });
  const location = made.headers.get("location")!;
  const del = await form(`${location}/delete`, {});
  expect(del.status).toBe(303);
  expect((await app.request(location)).status).toBe(404);
});

test("favorite toggles and only redirects to local paths", async () => {
  const made = await form("/recipes", { title: "Star Me" });
  const location = made.headers.get("location")!;
  const id = location.split("/").pop();
  const ok = await form(`${location}/favorite`, { next: "/?fav=1" });
  expect(ok.status).toBe(303);
  expect(ok.headers.get("location")).toBe("/?fav=1");
  const favs = (await (await app.request("/api/recipes?fav=1")).json()) as { id: number }[];
  expect(favs.some((r) => String(r.id) === id)).toBe(true);
  const evil = await form(`${location}/favorite`, { next: "https://example.com" });
  expect(evil.headers.get("location")).toBe(location);
});

test("unknown pages and recipes give a 404 page", async () => {
  expect((await app.request("/recipes/99999")).status).toBe(404);
  expect((await app.request("/nope")).status).toBe(404);
});
