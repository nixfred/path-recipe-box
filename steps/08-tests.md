# Step 08: Tests

## Goal

Teach the app to check itself. You will write automated tests that exercise the database functions and every route, using a throwaway database, and learn to read a passing and a failing test run. After this step you can change the app without wondering what you broke.

## Build

**Agent:** explain what a test is with a plain example first: "a test is a small program that uses your program and shouts if the answer is wrong". Write the first test file, run it, then the second. After both pass, do the "break it on purpose" exercise below with the human.

### 1. Test the database functions

**File: `app/tests/db.test.ts`**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  listTags,
  normalizeTags,
  openDb,
  toggleFavorite,
  updateRecipe,
  type RecipeInput,
} from "../src/db";

let dir: string;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recipe-box-db-"));
  db = openDb(join(dir, "test.sqlite"));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const sample: RecipeInput = {
  title: "Test Soup",
  description: "A soup for tests",
  ingredients: "water\nsalt",
  steps: "boil\nserve",
  tags: "Soup, Quick, soup",
  prep_minutes: 15,
  servings: 2,
};

test("a new database is seeded with 3 recipes", () => {
  expect(listRecipes(db)).toHaveLength(3);
});

test("opening an existing database does not seed again", () => {
  const path = join(dir, "again.sqlite");
  const first = openDb(path);
  deleteRecipe(first, listRecipes(first)[0]!.id);
  first.close();
  const second = openDb(path);
  expect(listRecipes(second)).toHaveLength(2);
  second.close();
});

test("normalizeTags lowercases, trims, and removes duplicates", () => {
  expect(normalizeTags(" Pasta, quick ,PASTA,, ")).toBe("pasta,quick");
  expect(normalizeTags("")).toBe("");
});

test("create then get returns the same recipe with normalized tags", () => {
  const made = createRecipe(db, sample);
  expect(made.id).toBeGreaterThan(0);
  expect(made.tags).toBe("soup,quick");
  expect(made.favorite).toBe(0);
  expect(getRecipe(db, made.id)?.title).toBe("Test Soup");
});

test("getRecipe returns null for a missing id", () => {
  expect(getRecipe(db, 99999)).toBeNull();
});

test("update changes fields and returns null for a missing id", () => {
  const made = createRecipe(db, sample);
  const updated = updateRecipe(db, made.id, { ...sample, title: "Better Soup" });
  expect(updated?.title).toBe("Better Soup");
  expect(updateRecipe(db, 99999, sample)).toBeNull();
});

test("delete removes the recipe once", () => {
  const made = createRecipe(db, sample);
  expect(deleteRecipe(db, made.id)).toBe(true);
  expect(deleteRecipe(db, made.id)).toBe(false);
  expect(getRecipe(db, made.id)).toBeNull();
});

test("search matches title, ingredients, and tags, ignoring case", () => {
  createRecipe(db, { ...sample, title: "Zebra Stew", ingredients: "quinoa", tags: "stew" });
  expect(listRecipes(db, { q: "ZEBRA" }).map((r) => r.title)).toEqual(["Zebra Stew"]);
  expect(listRecipes(db, { q: "quinoa" }).map((r) => r.title)).toEqual(["Zebra Stew"]);
  expect(listRecipes(db, { q: "stew" }).map((r) => r.title)).toEqual(["Zebra Stew"]);
  expect(listRecipes(db, { q: "nothing-matches-this" })).toHaveLength(0);
});

test("tag filter matches whole tags only", () => {
  createRecipe(db, { ...sample, title: "Pizza", tags: "pizza-night" });
  createRecipe(db, { ...sample, title: "Pie", tags: "pie" });
  expect(listRecipes(db, { tag: "pie" }).map((r) => r.title)).toEqual(["Pie"]);
});

test("search text is bound, not pasted into SQL (injection attempt finds nothing)", () => {
  const before = listRecipes(db).length;
  expect(listRecipes(db, { q: "'; DROP TABLE recipes; --" })).toHaveLength(0);
  expect(listRecipes(db)).toHaveLength(before);
});

test("toggleFavorite flips and favorites sort first", () => {
  const made = createRecipe(db, { ...sample, title: "Aardvark Pie" });
  expect(toggleFavorite(db, made.id)?.favorite).toBe(1);
  expect(listRecipes(db)[0]?.id).toBe(made.id);
  expect(listRecipes(db, { favoritesOnly: true })).toHaveLength(1);
  expect(toggleFavorite(db, made.id)?.favorite).toBe(0);
  expect(toggleFavorite(db, 99999)).toBeNull();
});

test("listTags counts how many recipes use each tag", () => {
  const tags = listTags(db);
  const quick = tags.find((t) => t.tag === "quick");
  expect(quick?.count).toBe(3);
});
```

Walk through the pattern:

- `beforeEach` makes a brand new database in a temporary folder before every test. `afterEach` closes it and deletes the folder. Each test starts from a known state (three seeded recipes), and no test can disturb another.
- `test("...", () => { ... })` is one test. `expect(actual).toBe(expected)` says what must be true. If it is not, the test fails with a message showing both values.
- One test tries a SQL injection string and checks that the table survived. That is step 04's lesson, now enforced by a robot.

### 2. Test the routes

**File: `app/tests/app.test.ts`**

```ts
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
```

The key line is `app.request("/health")`. Hono lets you call your app directly, as if a request had arrived, with no network and no port. It returns a normal `Response` you can inspect. That is why `createApp(db)` is a function: each test file builds an app on top of its own temporary database.

### 3. Run them

```bash
cd app
bun test
```

You should see every test pass. Bun finds files ending in `.test.ts` by itself.

### 4. Break it on purpose

Ask the human to pick one line in `src/index.ts`, for example change `201` to `200` in the create route, then run `bun test` again. A test fails and says what it expected. Fix the line and run it again. Seeing a test fail for a good reason is how you learn to trust it when it passes.

### 5. Commit

```bash
git add -A
git commit -m "Step 08: bun test suites for db functions and routes using temp databases"
```

Update `PROGRESS.md` first.

## Why

**Why write tests?** Code you cannot check is code you are afraid to change. With tests, "did I break anything?" takes two seconds instead of ten minutes of clicking around. You are building something your agent will help you change later, and tests are how both of you know a change was safe.

**Why a temporary database?** Tests must never touch your real recipes. A fresh file in the system's temp folder, deleted afterwards, means you can run the tests a hundred times without risk.

**Why `app.request` instead of starting a server?** It is faster (no network), simpler (no ports to clash), and tests exactly the same code that real requests reach.

**What should you test?** The things that would hurt if they broke: saving and loading, input checks, status codes, search, deleting, and security rules such as escaping and the safe redirect. You do not need a test for every line. A handful that cover the important behaviors are worth far more than none.

**What are the checker's tests compared to yours?** `checks/check.ts` tests your running app from the outside, the way a visitor would. Your `bun test` suite tests the code from the inside. Both are useful, and neither replaces the other.

## Check

From the repo root:

```bash
bun checks/check.ts 8
```

This runs the checks for stages 1 to 7 and also runs `bun test` inside `app/`.

Manual checks:

- `cd app && bun test` finishes with `0 fail` in its summary, next to the number of tests that pass.
- After the "break it on purpose" exercise, you saw a failure and then fixed it.

Then stop. Show the human the result and ask if they have questions before step 09.
