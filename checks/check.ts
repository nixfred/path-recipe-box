// Stage checker for the Recipe Box path.
//
//   bun checks/check.ts <stage> [--dir app]
//
// Run it from the repo root. It starts your app on a free port with a
// throwaway database, runs every check for stages 1 up to <stage>, prints
// PASS or FAIL for each (with a hint when something fails), then stops the
// server and deletes the throwaway database. Exit code is 0 only if all pass.
//
// Use `--dir reference` to run the same checks against the answer key.

import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const LAST_STAGE = 10;

// ---------- Arguments ----------

const argv = process.argv.slice(2);
const dirFlag = argv.indexOf("--dir");
const dirName = dirFlag >= 0 ? (argv[dirFlag + 1] ?? "app") : "app";
const stageArg = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--dir");
const stage = Number(stageArg);

if (!Number.isInteger(stage) || stage < 1 || stage > LAST_STAGE) {
  console.error(`Usage: bun checks/check.ts <stage 1-${LAST_STAGE}> [--dir app]`);
  process.exit(2);
}

const dir = resolve(dirName);
if (!existsSync(dir)) {
  console.error(`Directory not found: ${dir}`);
  process.exit(2);
}

// ---------- Tiny test harness ----------

type Check = {
  stage: number;
  name: string;
  hint: string;
  run: () => Promise<void> | void;
};

const checks: Check[] = [];
const add = (stage: number, name: string, hint: string, run: Check["run"]) =>
  checks.push({ stage, name, hint, run });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

// ---------- Server plumbing ----------

let base = "";
let dbPath = "";
const tempDir = mkdtempSync(join(tmpdir(), "recipe-box-check-"));
let server: ReturnType<typeof Bun.spawn> | null = null;
let serverOutput = "";

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port as number;
  await probe.stop(true);
  return port;
}

async function drain(stream: ReadableStream<Uint8Array> | null | undefined) {
  if (!stream) return;
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    serverOutput += decoder.decode(chunk);
    if (serverOutput.length > 4000) serverOutput = serverOutput.slice(-4000);
  }
}

async function startServer(): Promise<string | null> {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  dbPath = join(tempDir, "check.sqlite");
  server = Bun.spawn([process.execPath, "src/index.ts"], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
    stdout: "pipe",
    stderr: "pipe",
  });
  void drain(server.stdout as ReadableStream<Uint8Array>);
  void drain(server.stderr as ReadableStream<Uint8Array>);

  let exited = false;
  void server.exited.then(() => (exited = true));

  for (let i = 0; i < 60; i++) {
    if (exited) break;
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return null;
    } catch {
      // not up yet
    }
    await Bun.sleep(150);
  }
  return exited
    ? "The server exited right away. Its output:\n" + serverOutput.trim()
    : "The server did not answer on /health within about 9 seconds. Its output:\n" + serverOutput.trim();
}

function stopServer() {
  server?.kill();
  server = null;
}

const get = (path: string) => fetch(base + path, { redirect: "manual" });
const sendJson = (method: string, path: string, body?: unknown) =>
  fetch(base + path, {
    method,
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const sendForm = (path: string, fields: Record<string, string>) =>
  fetch(base + path, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

type Recipe = Record<string, any>;
const uniq = () => Math.random().toString(36).slice(2, 8);

async function apiCreate(body: Record<string, unknown>): Promise<Recipe> {
  const res = await sendJson("POST", "/api/recipes", body);
  assert(res.status === 201, `POST /api/recipes returned ${res.status}, expected 201`);
  return (await res.json()) as Recipe;
}
const apiDelete = (id: number) => sendJson("DELETE", `/api/recipes/${id}`);

// ---------- Stage 1: setup ----------

add(1, "package.json exists", "Run `bun init -y` inside the app folder (step 01).", async () => {
  assert(existsSync(join(dir, "package.json")), `No package.json in ${dir}`);
  JSON.parse(await Bun.file(join(dir, "package.json")).text());
});
add(1, "src/index.ts exists", "Create src/index.ts as shown in step 01.", () => {
  assert(existsSync(join(dir, "src/index.ts")), `No src/index.ts in ${dir}`);
});
add(1, "package.json has dev and start scripts", "Add the dev and start scripts from step 01.", async () => {
  const pkg = JSON.parse(await Bun.file(join(dir, "package.json")).text());
  assert(pkg.scripts?.dev?.includes("src/index.ts"), 'scripts.dev should run src/index.ts, e.g. "bun --hot src/index.ts"');
  assert(pkg.scripts?.start?.includes("src/index.ts"), 'scripts.start should run src/index.ts, e.g. "bun src/index.ts"');
});
add(1, "bun is installed", "Install Bun (your agent will ask first), then open a new terminal.", () => {
  assert(typeof Bun.version === "string" && Bun.version.length > 0, "Bun is not available");
});

// ---------- Stage 2: hello server ----------

add(2, "hono is a dependency", "Run `bun add hono` inside the app folder.", async () => {
  const pkg = JSON.parse(await Bun.file(join(dir, "package.json")).text());
  assert(pkg.dependencies?.hono, "hono is not listed under dependencies in package.json");
});
add(2, "GET / answers 200", "Add app.get(\"/\", ...) in src/index.ts and make sure the server starts.", async () => {
  const res = await get("/");
  assert(res.status === 200, `GET / returned ${res.status}, expected 200`);
});
add(2, "GET /health returns { ok: true }", 'Add app.get("/health", (c) => c.json({ ok: true })).', async () => {
  const res = await get("/health");
  assert(res.status === 200, `GET /health returned ${res.status}`);
  const body = (await res.json()) as Recipe;
  assert(body.ok === true, `Expected {"ok":true}, got ${JSON.stringify(body)}`);
});
add(2, "server honors PORT", "Read the port with Number(process.env.PORT ?? 3000).", () => {
  assert(base.length > 0, "No server was started on the PORT given by the checker");
});

// ---------- Stage 3: database ----------

add(3, "database file is created at DB_PATH", "Open the database with openDb(process.env.DB_PATH ?? \"data/recipes.sqlite\") when the server starts.", () => {
  assert(existsSync(dbPath), `No database file at ${dbPath}. Does the server read DB_PATH?`);
});
add(3, "recipes table has the expected columns", "Compare your CREATE TABLE with step 03.", () => {
  const db = new Database(dbPath, { readonly: true });
  try {
    const cols = (db.query("PRAGMA table_info(recipes)").all() as { name: string }[]).map((c) => c.name);
    const want = ["id", "title", "description", "ingredients", "steps", "tags", "prep_minutes", "servings", "favorite", "created_at", "updated_at"];
    const missing = want.filter((c) => !cols.includes(c));
    assert(cols.length > 0, "There is no recipes table");
    assert(missing.length === 0, `Missing columns: ${missing.join(", ")}`);
  } finally {
    db.close();
  }
});
add(3, "sample recipes were seeded (3 or more)", "Seed three recipes when the table is empty (step 03).", () => {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.query("SELECT COUNT(*) AS n FROM recipes").get() as { n: number };
    assert(row.n >= 3, `Expected at least 3 recipes, found ${row.n}`);
  } finally {
    db.close();
  }
});
add(3, "database uses WAL mode", 'Run db.run("PRAGMA journal_mode = WAL") right after opening.', () => {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
    assert(row.journal_mode === "wal", `journal_mode is "${row.journal_mode}", expected "wal"`);
  } finally {
    db.close();
  }
});

// ---------- Stage 4: JSON API ----------

add(4, "GET /api/recipes returns a list with recipe fields", "Return listRecipes(db) with c.json().", async () => {
  const res = await get("/api/recipes");
  assert(res.status === 200, `GET /api/recipes returned ${res.status}`);
  const list = (await res.json()) as Recipe[];
  assert(Array.isArray(list) && list.length >= 3, "Expected an array with at least 3 recipes");
  for (const key of ["id", "title", "description", "ingredients", "steps", "tags", "prep_minutes", "servings", "favorite", "created_at", "updated_at"]) {
    assert(key in list[0]!, `Recipe objects are missing the "${key}" field`);
  }
});
add(4, "POST /api/recipes creates (201) and normalizes tags", "Validate, insert, return the new row with status 201. Tags: lowercase, trimmed, no duplicates.", async () => {
  const made = await apiCreate({ title: "Check Soup", tags: "Soup, QUICK, soup", ingredients: "water\nsalt", servings: 2 });
  try {
    assert(made.tags === "soup,quick", `tags should be "soup,quick", got "${made.tags}"`);
    assert(made.favorite === 0, `favorite should start at 0, got ${made.favorite}`);
    assert(typeof made.id === "number", "The response needs a numeric id");
  } finally {
    await apiDelete(made.id);
  }
});
add(4, "GET /api/recipes/:id returns one recipe", "Look it up by id; 200 with the recipe.", async () => {
  const made = await apiCreate({ title: "Check Single" });
  try {
    const res = await get(`/api/recipes/${made.id}`);
    assert(res.status === 200, `GET /api/recipes/${made.id} returned ${res.status}`);
    assert(((await res.json()) as Recipe).title === "Check Single", "Wrong recipe returned");
  } finally {
    await apiDelete(made.id);
  }
});
add(4, "PUT /api/recipes/:id updates", "Update the row and return it with status 200.", async () => {
  const made = await apiCreate({ title: "Check Before" });
  try {
    const res = await sendJson("PUT", `/api/recipes/${made.id}`, { title: "Check After", servings: 6 });
    assert(res.status === 200, `PUT returned ${res.status}, expected 200`);
    const body = (await res.json()) as Recipe;
    assert(body.title === "Check After" && body.servings === 6, `Update did not apply: ${JSON.stringify(body)}`);
  } finally {
    await apiDelete(made.id);
  }
});
add(4, "DELETE /api/recipes/:id deletes", "Delete the row; then GET should be 404.", async () => {
  const made = await apiCreate({ title: "Check Delete" });
  const del = await apiDelete(made.id);
  assert(del.status === 200, `DELETE returned ${del.status}, expected 200`);
  const after = await get(`/api/recipes/${made.id}`);
  assert(after.status === 404, `GET after delete returned ${after.status}, expected 404`);
});
add(4, "missing title is a 400 with an error message", 'Return c.json({ error: "Title is required" }, 400).', async () => {
  const res = await sendJson("POST", "/api/recipes", { description: "no title here" });
  assert(res.status === 400, `POST without title returned ${res.status}, expected 400`);
  const body = (await res.json()) as Recipe;
  assert(typeof body.error === "string" && body.error.length > 0, "The 400 response needs an { error: \"...\" } message");
});
add(4, "unknown id is a 404 for GET, PUT, DELETE", 'Return c.json({ error: "Recipe not found" }, 404).', async () => {
  for (const [method, body] of [["GET", undefined], ["PUT", { title: "x" }], ["DELETE", undefined]] as const) {
    const res = await sendJson(method, "/api/recipes/999999", body);
    assert(res.status === 404, `${method} /api/recipes/999999 returned ${res.status}, expected 404`);
  }
});
add(4, "?q= searches title, ingredients, tags; ?tag= filters", "See step 04 and step 07 for the SQL. Use bound parameters.", async () => {
  const word = `zq${uniq()}`;
  const made = await apiCreate({ title: `Check ${word}`, ingredients: `ing${word}`, tags: `tag${word}` });
  try {
    for (const q of [word, `ing${word}`, `tag${word}`]) {
      const list = (await (await get(`/api/recipes?q=${q}`)).json()) as Recipe[];
      assert(list.length === 1 && list[0]!.id === made.id, `?q=${q} should find exactly the new recipe, got ${list.length} results`);
    }
    const byTag = (await (await get(`/api/recipes?tag=tag${word}`)).json()) as Recipe[];
    assert(byTag.length === 1, `?tag=tag${word} should return 1 recipe, got ${byTag.length}`);
    const none = (await (await get(`/api/recipes?q=${word}-nope`)).json()) as Recipe[];
    assert(none.length === 0, "A search with no matches should return []");
  } finally {
    await apiDelete(made.id);
  }
});
add(4, "SQL injection text does not break the database", "Never build SQL with string concatenation. Use ? placeholders.", async () => {
  const res = await get(`/api/recipes?q=${encodeURIComponent("'; DROP TABLE recipes; --")}`);
  assert(res.status === 200, `Search with quotes returned ${res.status}`);
  const after = (await (await get("/api/recipes")).json()) as Recipe[];
  assert(after.length >= 3, "The recipes table lost rows. Is your SQL built from strings?");
});

// ---------- Stage 5: pages ----------

add(5, "GET / returns an HTML page listing recipes", "Render with hono/html and return c.html(...).", async () => {
  const res = await get("/");
  assert(res.status === 200, `GET / returned ${res.status}`);
  assert((res.headers.get("content-type") ?? "").includes("text/html"), "GET / should be text/html");
  const list = (await (await get("/api/recipes")).json()) as Recipe[];
  const text = await res.text();
  assert(text.includes(list[0]!.title), `The home page does not show "${list[0]!.title}"`);
  assert(text.includes(`/recipes/${list[0]!.id}`), "Each recipe should link to /recipes/:id");
});
add(5, "GET /recipes/:id shows one recipe", "Render title, ingredients, and steps.", async () => {
  const made = await apiCreate({ title: "Check View", ingredients: "flour\neggs", steps: "mix\nbake" });
  try {
    const res = await get(`/recipes/${made.id}`);
    assert(res.status === 200, `GET /recipes/${made.id} returned ${res.status}`);
    const text = await res.text();
    for (const word of ["Check View", "flour", "eggs", "mix", "bake"]) {
      assert(text.includes(word), `The recipe page is missing "${word}"`);
    }
  } finally {
    await apiDelete(made.id);
  }
});
add(5, "GET /recipes/:id is a 404 page when missing", "Return c.html(..., 404) when getRecipe gives null.", async () => {
  const res = await get("/recipes/999999");
  assert(res.status === 404, `GET /recipes/999999 returned ${res.status}, expected 404`);
});
add(5, "HTML is escaped (no script injection)", "Only put values into pages through html`...${value}...`.", async () => {
  const evil = "<script>alert(1)</script>";
  const made = await apiCreate({ title: evil, description: evil });
  try {
    for (const path of ["/", `/recipes/${made.id}`]) {
      const text = await (await get(path)).text();
      assert(!text.includes(evil), `${path} contains the raw <script> tag. The page is not escaping values.`);
      assert(text.includes("&lt;script&gt;"), `${path} should show the title as escaped text`);
    }
  } finally {
    await apiDelete(made.id);
  }
});

// ---------- Stage 6: forms ----------

add(6, "GET /recipes/new shows a form", "Return a page with <form method=\"post\" action=\"/recipes\">.", async () => {
  const res = await get("/recipes/new");
  assert(res.status === 200, `GET /recipes/new returned ${res.status}`);
  const text = await res.text();
  assert(/<form[^>]*method="post"/i.test(text), "The page needs a <form method=\"post\">");
  assert(text.includes('name="title"'), 'The form needs an input named "title"');
});
add(6, "POST /recipes creates and redirects (303)", "After saving, c.redirect(`/recipes/${id}`, 303).", async () => {
  const res = await sendForm("/recipes", { title: "Check Form Create", ingredients: "a\r\nb", tags: "Form" });
  assert(res.status === 303, `POST /recipes returned ${res.status}, expected a 303 redirect`);
  const location = res.headers.get("location") ?? "";
  assert(/^\/recipes\/\d+$/.test(location), `Redirect location should look like /recipes/12, got "${location}"`);
  const page = await get(location);
  assert((await page.text()).includes("Check Form Create"), "The new recipe page does not show the title");
  await sendForm(`${location}/delete`, {});
});
add(6, "POST /recipes without a title re-shows the form (400)", "Re-render the form with an error and status 400. Keep what the person typed.", async () => {
  const res = await sendForm("/recipes", { title: "  ", description: "keep-this-text" });
  assert(res.status === 400, `Expected 400, got ${res.status}`);
  const text = await res.text();
  assert(text.includes("keep-this-text"), "The form should keep the values the person typed");
});
add(6, "edit form is prefilled, POST /recipes/:id updates", "GET /recipes/:id/edit shows current values; POST saves and redirects 303.", async () => {
  const made = await apiCreate({ title: "Check Edit Me" });
  try {
    const edit = await get(`/recipes/${made.id}/edit`);
    assert(edit.status === 200, `GET /recipes/${made.id}/edit returned ${edit.status}`);
    assert((await edit.text()).includes("Check Edit Me"), "The edit form should be prefilled with the title");
    const save = await sendForm(`/recipes/${made.id}`, { title: "Check Edited" });
    assert(save.status === 303, `POST /recipes/${made.id} returned ${save.status}, expected 303`);
    const after = (await (await get(`/api/recipes/${made.id}`)).json()) as Recipe;
    assert(after.title === "Check Edited", "The title was not updated");
  } finally {
    await apiDelete(made.id);
  }
});
add(6, "POST /recipes/:id/delete deletes and redirects", "Delete, then redirect 303 to /.", async () => {
  const made = await apiCreate({ title: "Check Form Delete" });
  const res = await sendForm(`/recipes/${made.id}/delete`, {});
  assert(res.status === 303, `Delete returned ${res.status}, expected 303`);
  assert((await get(`/api/recipes/${made.id}`)).status === 404, "The recipe is still there after delete");
});

// ---------- Stage 7: search, tags, favorites ----------

add(7, "home page has a search box and filters by ?q=", "Add a GET form with an input named q, and pass q to listRecipes.", async () => {
  const word = `zq${uniq()}`;
  const made = await apiCreate({ title: `Check ${word}` });
  try {
    const page = await (await get("/")).text();
    assert(page.includes('name="q"'), 'The home page needs an input named "q"');
    const hit = await (await get(`/?q=${word}`)).text();
    assert(hit.includes(`Check ${word}`), "?q= should show the matching recipe");
    const list = (await (await get("/api/recipes")).json()) as Recipe[];
    const other = list.find((r) => r.id !== made.id)!;
    assert(!hit.includes(`/recipes/${other.id}"`), "?q= should hide recipes that do not match");
  } finally {
    await apiDelete(made.id);
  }
});
add(7, "home page filters by ?tag= and lists tags", "Show tag links and filter with listRecipes({ tag }).", async () => {
  const tag = `tg${uniq()}`;
  const made = await apiCreate({ title: "Check Tagged", tags: tag });
  try {
    const all = await (await get("/")).text();
    assert(all.includes(`tag=${tag}`), "The home page should link to ?tag=<tag> for each tag");
    const filtered = await (await get(`/?tag=${tag}`)).text();
    assert(filtered.includes("Check Tagged"), "?tag= should show the tagged recipe");
    const list = (await (await get("/api/recipes")).json()) as Recipe[];
    const other = list.find((r) => r.id !== made.id)!;
    assert(!filtered.includes(`/recipes/${other.id}"`), "?tag= should hide recipes without that tag");
  } finally {
    await apiDelete(made.id);
  }
});
add(7, "POST /recipes/:id/favorite toggles and redirects", "Flip favorite between 0 and 1, then redirect 303.", async () => {
  const made = await apiCreate({ title: "Check Favorite" });
  try {
    const first = await sendForm(`/recipes/${made.id}/favorite`, {});
    assert(first.status === 303, `Favorite returned ${first.status}, expected 303`);
    let now = (await (await get(`/api/recipes/${made.id}`)).json()) as Recipe;
    assert(now.favorite === 1, `favorite should be 1 after the first toggle, got ${now.favorite}`);
    await sendForm(`/recipes/${made.id}/favorite`, {});
    now = (await (await get(`/api/recipes/${made.id}`)).json()) as Recipe;
    assert(now.favorite === 0, `favorite should be 0 after the second toggle, got ${now.favorite}`);
  } finally {
    await apiDelete(made.id);
  }
});
add(7, "favorites come first and ?fav=1 shows only favorites", "ORDER BY favorite DESC, title; filter favorite = 1 when fav=1.", async () => {
  const made = await apiCreate({ title: "Check Zed Favorite" });
  try {
    await sendForm(`/recipes/${made.id}/favorite`, {});
    const list = (await (await get("/api/recipes")).json()) as Recipe[];
    assert(list[0]!.id === made.id, "A favorite recipe should sort to the top of the list");
    const favs = (await (await get("/api/recipes?fav=1")).json()) as Recipe[];
    assert(favs.length >= 1 && favs.every((r) => r.favorite === 1), "?fav=1 should return only favorites");
  } finally {
    await apiDelete(made.id);
  }
});

// ---------- Stage 8: tests ----------

add(8, "tests folder has test files", "Create tests/db.test.ts and tests/app.test.ts (step 08).", () => {
  const files = existsSync(join(dir, "tests")) ? readdirSync(join(dir, "tests")) : [];
  assert(files.some((f) => f.endsWith(".test.ts")), "No *.test.ts files in tests/");
});
add(8, "`bun test` passes", "Run `bun test` in the app folder and read the first failure.", async () => {
  const proc = Bun.spawn([process.execPath, "test"], { cwd: dir, stdout: "pipe", stderr: "pipe", env: { ...process.env, DB_PATH: join(tempDir, "unit.sqlite") } });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  assert(code === 0, `bun test failed:\n${(out + err).trim().split("\n").slice(-25).join("\n")}`);
});

// ---------- Stage 9: style and polish ----------

add(9, "GET /style.css serves a real stylesheet", 'app.get("/style.css", serveStatic({ path: "./public/style.css" })) and write the CSS.', async () => {
  const res = await get("/style.css");
  assert(res.status === 200, `GET /style.css returned ${res.status}`);
  assert((res.headers.get("content-type") ?? "").includes("text/css"), `Content-Type should be text/css, got "${res.headers.get("content-type")}"`);
  assert((await res.text()).length > 500, "The stylesheet looks too short. Paste the full CSS from step 09.");
});
add(9, "pages link the stylesheet and set a viewport", 'Add <link rel="stylesheet" href="/style.css"> and the viewport <meta> to the layout.', async () => {
  const text = await (await get("/")).text();
  assert(text.includes('href="/style.css"'), "The layout should link /style.css");
  assert(text.includes('name="viewport"'), "The layout should include a viewport meta tag");
});
add(9, "empty search shows a friendly empty state", 'Show "No recipes" text when a search has no matches.', async () => {
  const res = await get(`/?q=zzzz-no-match-${uniq()}`);
  assert(res.status === 200, `Search with no matches returned ${res.status}`);
  assert((await res.text()).includes("No recipes"), 'The page should say "No recipes ..." when nothing matches');
});
add(9, "unknown pages show a styled 404 page", "app.notFound((c) => c.html(notFoundPage(), 404)).", async () => {
  const res = await get("/definitely-not-a-page");
  assert(res.status === 404, `Expected 404, got ${res.status}`);
  assert((res.headers.get("content-type") ?? "").includes("text/html"), "The 404 should be an HTML page");
});

// ---------- Stage 10: make it yours ----------

add(10, "backup script writes a working copy", "Add scripts/backup.ts and a backup script in package.json (step 10).", async () => {
  assert(existsSync(join(dir, "scripts/backup.ts")), "No scripts/backup.ts");
  const target = join(tempDir, "backup-copy.sqlite");
  const proc = Bun.spawn([process.execPath, "scripts/backup.ts", target], { cwd: dir, stdout: "pipe", stderr: "pipe", env: { ...process.env, DB_PATH: dbPath } });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  assert((await proc.exited) === 0, `Backup script failed:\n${(out + err).trim()}`);
  assert(existsSync(target), "The backup file was not created");
  const copy = new Database(target, { readonly: true });
  try {
    const row = copy.query("SELECT COUNT(*) AS n FROM recipes").get() as { n: number };
    assert(row.n >= 3, `The backup has ${row.n} recipes, expected at least 3`);
  } finally {
    copy.close();
  }
});
add(10, ".gitignore keeps your database out of git", "Add *.sqlite (and data/) to .gitignore so your recipes are not committed by accident.", async () => {
  const ignore = existsSync(join(dir, ".gitignore")) ? await Bun.file(join(dir, ".gitignore")).text() : "";
  const root = existsSync(resolve(".gitignore")) ? await Bun.file(resolve(".gitignore")).text() : "";
  assert((ignore + root).includes("sqlite"), "Neither app/.gitignore nor the root .gitignore mentions sqlite files");
});

// ---------- Run ----------

async function main() {
  const wanted = checks.filter((c) => c.stage <= stage);
  const needsServer = wanted.some((c) => c.stage >= 2 && c.stage !== 8 && c.stage !== 10) || stage >= 2;

  console.log(`\nRecipe Box checks: stage 1 to ${stage} in ${dirName}/\n`);

  let startupError: string | null = null;
  const stage1Ok = wanted.filter((c) => c.stage === 1);
  let stage1Failed = false;
  for (const c of stage1Ok) {
    try {
      await c.run();
    } catch {
      stage1Failed = true;
    }
  }

  if (needsServer && !stage1Failed) startupError = await startServer();
  else if (needsServer) startupError = "Skipped: fix the stage 1 checks first, then the server can start.";

  let failed = 0;
  let lastStage = 0;
  for (const c of wanted) {
    if (c.stage !== lastStage) {
      lastStage = c.stage;
      console.log(`Stage ${c.stage}`);
    }
    try {
      if (c.stage >= 2 && startupError && c.stage !== 8) {
        // Stage 2 checks that only read package.json can still run without a server.
        if (c.name !== "hono is a dependency") throw new Error(startupError);
      }
      await c.run();
      console.log(`  PASS  ${c.name}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${c.name}`);
      console.log(`        ${String((e as Error).message).split("\n").join("\n        ")}`);
      console.log(`        Hint: ${c.hint}`);
    }
  }

  stopServer();
  await Bun.sleep(100);
  rmSync(tempDir, { recursive: true, force: true });

  console.log(
    failed === 0
      ? `\nAll ${wanted.length} checks passed through stage ${stage}. Nice work.\n`
      : `\n${failed} of ${wanted.length} checks failed. Fix the first FAIL above, then run this again.\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

await main();
