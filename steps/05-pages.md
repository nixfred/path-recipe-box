# Step 05: Pages

## Goal

Show your recipes in the browser. You will build a home page that lists every recipe as a card, and a page for a single recipe with its ingredients and steps. Along the way you will learn why web pages must escape text, and watch Hono do it for you.

## Build

**Agent:** explain HTML in two sentences if the human is new to it (it is the text a browser turns into a page), and explain templates before you write `views.ts`. Run the escaping demo in the Check section with the human and let them see the result in the browser.

### 1. Write the page templates

**File: `app/src/views.ts`**

```ts
import { html } from "hono/html";
import type { Recipe } from "./db";

// html`...` is a tagged template. Every ${value} you put inside is HTML-escaped
// automatically, so a recipe titled <script>alert(1)</script> is shown as plain
// text instead of running. Never build HTML by gluing strings together yourself.
type Html = ReturnType<typeof html>;

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

// ---------- Layout: the frame every page shares ----------

export function layout(title: string, body: Html): Html {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>${title} | Recipe Box</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <header class="site-header">
          <a class="brand" href="/">Recipe Box</a>
        </header>
        <main>${body}</main>
      </body>
    </html>`;
}

// ---------- Small pieces ----------

function tagList(tags: string): Html {
  const list = tags ? tags.split(",") : [];
  return html`${list.map((t) => html`<span class="tag">${t}</span>`)}`;
}

function meta(r: Recipe): Html {
  const bits: string[] = [];
  if (r.prep_minutes !== null) bits.push(`${r.prep_minutes} min`);
  if (r.servings !== null) bits.push(`serves ${r.servings}`);
  return html`${bits.join(" · ")}`;
}

function card(r: Recipe): Html {
  return html`<article class="card">
    <div class="card-top">
      <h2><a href="/recipes/${r.id}">${r.title}</a></h2>
    </div>
    <p class="muted">${r.description}</p>
    <p class="muted small">${meta(r)}</p>
    <p class="tags">${tagList(r.tags)}</p>
  </article>`;
}

// ---------- Pages ----------

export function listPage(recipes: Recipe[]): Html {
  const body =
    recipes.length === 0
      ? html`<div class="empty"><p>No recipes yet.</p></div>`
      : html`<section class="grid">${recipes.map((r) => card(r))}</section>`;
  return layout("Recipes", body);
}

export function viewPage(r: Recipe): Html {
  const ingredients = splitLines(r.ingredients);
  const steps = splitLines(r.steps);
  const body = html`
    <article class="recipe">
      <div class="card-top">
        <h1>${r.title}</h1>
      </div>
      <p class="muted">${r.description}</p>
      <p class="muted small">${meta(r)}</p>
      <p class="tags">${tagList(r.tags)}</p>

      <div class="columns">
        <section>
          <h2>Ingredients</h2>
          ${ingredients.length
            ? html`<ul>
                ${ingredients.map((line) => html`<li>${line}</li>`)}
              </ul>`
            : html`<p class="muted">None listed.</p>`}
        </section>
        <section>
          <h2>Steps</h2>
          ${steps.length
            ? html`<ol>
                ${steps.map((line) => html`<li>${line}</li>`)}
              </ol>`
            : html`<p class="muted">None listed.</p>`}
        </section>
      </div>

      <div class="actions">
        <a href="/">Back to all recipes</a>
      </div>
    </article>
  `;
  return layout(r.title, body);
}

export function notFoundPage(): Html {
  return layout(
    "Not found",
    html`<div class="empty">
      <h1>Not found</h1>
      <p>That page or recipe does not exist.</p>
      <p><a class="button" href="/">Back to all recipes</a></p>
    </div>`,
  );
}
```

Walk through it:

- **`html` tagged template.** Anything written as `` html`...` `` is HTML with holes. What goes in a `${hole}` is escaped for you. If a title contains `<script>`, the browser receives `&lt;script&gt;` and displays the characters instead of running them.
- **`layout`.** The frame every page shares: the `<head>` (title, stylesheet link, mobile viewport) and a header. Each page hands it a title and a body.
- **Small pieces.** `card`, `tagList`, and `meta` are small functions that each produce a little piece of HTML. Building pages from small pieces keeps each one easy to read.
- **`listPage`, `viewPage`, `notFoundPage`.** One function per page. They take data in and return HTML. They never touch the database, which keeps them easy to reason about.
- **Arrays in templates.** `${recipes.map((r) => card(r))}` turns a list of recipes into a list of cards. Hono joins them together and escapes anything that is not already safe HTML.

### 2. Add a starter stylesheet

Pages need to be readable now. Step 09 replaces this file with the full design.

**File: `app/public/style.css`**

```css
/* Starter styles. Step 09 replaces this with the full stylesheet. */
body {
  background: #0f1115;
  color: #e8eaf0;
  font: 16px/1.6 system-ui, sans-serif;
  margin: 0 auto;
  max-width: 960px;
  padding: 1rem;
}

a {
  color: #f5a65b;
}
```

### 3. Add the page routes

**File: `app/src/index.ts`** (replace the whole file)

```ts
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  openDb,
  updateRecipe,
  type RecipeInput,
} from "./db";
import { listPage, notFoundPage, viewPage } from "./views";

// ---------- Input checking ----------
// Never trust what arrives over the network. Check it, clean it, then use it.

type Parsed = { ok: true; value: RecipeInput } | { ok: false; error: string };

// Text fields may arrive as a string or (from JSON clients) an array of strings.
function asText(v: unknown, joiner: string): string {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(joiner);
  if (typeof v === "string") return v;
  return "";
}

// One item per line, no blank lines, no stray spaces.
function cleanLines(v: unknown): string {
  return asText(v, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function wholeNumberOrNull(v: unknown, label: string): number | null | Error {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < 0 || n > 100000) {
    return new Error(`${label} must be a whole number, 0 or more`);
  }
  return n;
}

export function parseRecipeInput(raw: Record<string, unknown>): Parsed {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return { ok: false, error: "Title is required" };
  if (title.length > 200) return { ok: false, error: "Title must be 200 characters or fewer" };

  const prep = wholeNumberOrNull(raw.prep_minutes, "Prep minutes");
  if (prep instanceof Error) return { ok: false, error: prep.message };
  const servings = wholeNumberOrNull(raw.servings, "Servings");
  if (servings instanceof Error) return { ok: false, error: servings.message };

  return {
    ok: true,
    value: {
      title,
      description: asText(raw.description, " ").trim(),
      ingredients: cleanLines(raw.ingredients),
      steps: cleanLines(raw.steps),
      tags: asText(raw.tags, ","),
      prep_minutes: prep,
      servings,
    },
  };
}

// "12" -> 12. Anything else -> null (treated as not found).
function parseId(param: string): number | null {
  return /^\d+$/.test(param) ? Number(param) : null;
}

// ---------- The app ----------

export function createApp(db: Database) {
  const app = new Hono();

  // Serve the one stylesheet. "./public/style.css" is relative to where you start the server (the app folder).
  app.get("/style.css", serveStatic({ path: "./public/style.css" }));

  app.get("/health", (c) => c.json({ ok: true }));

  // ----- JSON API -----

  app.get("/api/recipes", (c) => {
    const recipes = listRecipes(db, {
      q: c.req.query("q"),
      tag: c.req.query("tag"),
      favoritesOnly: c.req.query("fav") === "1",
    });
    return c.json(recipes);
  });

  app.get("/api/recipes/:id", (c) => {
    const id = parseId(c.req.param("id"));
    const recipe = id === null ? null : getRecipe(db, id);
    if (!recipe) return c.json({ error: "Recipe not found" }, 404);
    return c.json(recipe);
  });

  app.post("/api/recipes", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Request body must be a JSON object" }, 400);
    }
    const parsed = parseRecipeInput(body as Record<string, unknown>);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    return c.json(createRecipe(db, parsed.value), 201);
  });

  app.put("/api/recipes/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null || !getRecipe(db, id)) return c.json({ error: "Recipe not found" }, 404);
    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Request body must be a JSON object" }, 400);
    }
    const parsed = parseRecipeInput(body as Record<string, unknown>);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    return c.json(updateRecipe(db, id, parsed.value));
  });

  app.delete("/api/recipes/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null || !deleteRecipe(db, id)) return c.json({ error: "Recipe not found" }, 404);
    return c.json({ ok: true });
  });

  // ----- Pages -----

  app.get("/", (c) => c.html(listPage(listRecipes(db))));

  app.get("/recipes/:id", (c) => {
    const id = parseId(c.req.param("id"));
    const recipe = id === null ? null : getRecipe(db, id);
    if (!recipe) return c.html(notFoundPage(), 404);
    return c.html(viewPage(recipe));
  });

  // Any URL we did not define lands here.
  app.notFound((c) => c.html(notFoundPage(), 404));

  return app;
}

// ---------- Start the server ----------

const PORT = Number(process.env.PORT ?? 3000);
// 127.0.0.1 means "only this computer". The app has no login, so keep it private unless you choose otherwise.
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_PATH = process.env.DB_PATH ?? "data/recipes.sqlite";

if (import.meta.main) {
  const db = openDb(DB_PATH);
  Bun.serve({ hostname: HOST, port: PORT, fetch: createApp(db).fetch });
  console.log(`Recipe Box running at http://localhost:${PORT}`);
}
```

What changed from step 04:

- The temporary hello route is gone. `GET /` now returns `c.html(listPage(...))`.
- `GET /recipes/:id` shows one recipe, or the not found page with a `404` status.
- `serveStatic` from `hono/bun` sends the file `public/style.css` when a browser asks for `/style.css`. The path is relative to the folder you start the server from, so always start it from inside `app/`.
- `app.notFound(...)` catches every URL we did not define and returns the friendly not found page, still with a real `404` status.

### 4. Look at it

```bash
cd app
bun run dev
```

Open http://localhost:3000. You should see three recipe cards. Click one.

### 5. Commit

```bash
git add -A
git commit -m "Step 05: server rendered list and recipe pages with hono/html escaping"
```

Update `PROGRESS.md` first.

## Why

**Why server rendered HTML?** The server builds the whole page and sends finished HTML. The browser just displays it. There is no framework to learn, no build step, nothing to download but the page. It is fast, it works without JavaScript, and when something looks wrong you can use "View Source" in the browser to see exactly what the server sent. This is how the web worked for decades, and it is still an excellent way to build apps.

**What is XSS, and why does escaping matter?** Cross site scripting. Suppose a recipe is titled:

```html
<script>alert("gotcha")</script>
```

If a page pasted that text straight into its HTML, every visitor's browser would run it as code. Real attackers use this to steal logins or change what a page says. The cure is to escape text: replace `<` with `&lt;` and `>` with `&gt;` so the browser shows the characters instead of treating them as tags.

Hono's `html` helper escapes every `${value}` automatically. That means the safe way is also the easy way. The dangerous move would be opting out, using `raw(...)`, on text you did not write yourself. Do not do that in this project.

**Why separate `views.ts` from `index.ts`?** One file knows how to look things up and decide what to do. The other knows how to draw. When you want to change how a page looks, you open `views.ts` and nothing else. When you want to change how a request is handled, you stay in `index.ts`.

**Why a real 404?** Search engines, browsers, and scripts all rely on the status code. A "not found" page that answers `200` lies to all of them.

## Check

From the repo root:

```bash
bun checks/check.ts 5
```

Manual checks, with the server running:

1. Open http://localhost:3000 and click into a recipe. Both pages should load.
2. Open http://localhost:3000/recipes/99999. You should see a "Not found" page.
3. The escaping demo. Create a recipe with a nasty title through the API:

```bash
curl -X POST http://localhost:3000/api/recipes \
  -H "content-type: application/json" \
  -d '{"title":"<script>alert(1)</script>"}'
```

   Reload the home page. The title appears as literal text, `<script>alert(1)</script>`, and no alert pops up. Use "View Source" to see the `&lt;script&gt;` the server actually sent. Then delete the test recipe with `curl -X DELETE http://localhost:3000/api/recipes/<id>`, using the id from the create response. Read the id from the response rather than guessing it; ids are never reused, so after any earlier creates or deletes it will not be 4.

Then stop. Show the human the result and ask if they have questions before step 06.
