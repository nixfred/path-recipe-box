# Step 07: Search, tags, and favorites

## Goal

Make the recipe box easy to use once it has more than a handful of recipes. You will add a search box, clickable tag filters, and a star button to mark favorites. Favorites float to the top of the list.

## Build

**Agent:** this step touches three files. Explain the plan first: two small database functions, one change to the pages, one change to the routes. Then do them in that order, explaining each.

### 1. Two more database functions

Search and the tag filter already work inside `listRecipes`, which you wrote in step 03 and used in step 04. Favorites and the tag list need two new functions. Add them to the end of `app/src/db.ts`, after the `seedIfEmpty` function.

**Append to `app/src/db.ts`**

```ts
export function toggleFavorite(db: Database, id: number): Recipe | null {
  const result = db
    .query("UPDATE recipes SET favorite = 1 - favorite, updated_at = ? WHERE id = ?")
    .run(now(), id);
  return result.changes > 0 ? getRecipe(db, id) : null;
}

// Every distinct tag with how many recipes use it, for the filter bar.
export function listTags(db: Database): { tag: string; count: number }[] {
  const rows = db.query("SELECT tags FROM recipes WHERE tags != ''").all() as { tags: string }[];
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags.split(",")) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}
```

- **`toggleFavorite`** flips the flag with `1 - favorite`: 0 becomes 1, 1 becomes 0. It is done inside the database in one statement, so there is no "read, then write" gap where two clicks could collide.
- **`listTags`** gathers every tag with a count, for the filter bar. It reads all the tag strings, splits them, and counts.

### 2. Update the pages

**File: `app/src/views.ts`** (replace the whole file)

```ts
import { html } from "hono/html";
import type { Recipe } from "./db";

// html`...` is a tagged template. Every ${value} you put inside is HTML-escaped
// automatically, so a recipe titled <script>alert(1)</script> is shown as plain
// text instead of running. Never build HTML by gluing strings together yourself.
type Html = ReturnType<typeof html>;

export type FormValues = {
  title: string;
  description: string;
  ingredients: string;
  steps: string;
  tags: string;
  prep_minutes: string;
  servings: string;
};

export const emptyForm: FormValues = {
  title: "",
  description: "",
  ingredients: "",
  steps: "",
  tags: "",
  prep_minutes: "",
  servings: "",
};

export function recipeToForm(r: Recipe): FormValues {
  return {
    title: r.title,
    description: r.description,
    ingredients: r.ingredients,
    steps: r.steps,
    tags: r.tags,
    prep_minutes: r.prep_minutes?.toString() ?? "",
    servings: r.servings?.toString() ?? "",
  };
}

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

// ---------- Layout ----------

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
          <a class="button" href="/recipes/new">New recipe</a>
        </header>
        <main>${body}</main>
      </body>
    </html>`;
}

// ---------- Small pieces ----------

function tagLinks(tags: string): Html {
  const list = tags ? tags.split(",") : [];
  return html`${list.map((t) => html`<a class="tag" href="/?tag=${encodeURIComponent(t)}">${t}</a>`)}`;
}

function favoriteButton(r: Recipe, next: string): Html {
  return html`<form class="inline" method="post" action="/recipes/${r.id}/favorite">
    <input type="hidden" name="next" value="${next}" />
    <button
      class="star ${r.favorite ? "on" : ""}"
      type="submit"
      aria-label="${r.favorite ? "Remove from favorites" : "Add to favorites"}"
      title="${r.favorite ? "Remove from favorites" : "Add to favorites"}"
    >
      ${r.favorite ? "★" : "☆"}
    </button>
  </form>`;
}

function meta(r: Recipe): Html {
  const bits: string[] = [];
  if (r.prep_minutes !== null) bits.push(`${r.prep_minutes} min`);
  if (r.servings !== null) bits.push(`serves ${r.servings}`);
  return html`${bits.join(" · ")}`;
}

function card(r: Recipe, here: string): Html {
  return html`<article class="card">
    <div class="card-top">
      <h2><a href="/recipes/${r.id}">${r.title}</a></h2>
      ${favoriteButton(r, here)}
    </div>
    <p class="muted">${r.description}</p>
    <p class="muted small">${meta(r)}</p>
    <p class="tags">${tagLinks(r.tags)}</p>
  </article>`;
}

// ---------- Pages ----------

export type ListView = {
  recipes: Recipe[];
  tags: { tag: string; count: number }[];
  q: string;
  tag: string;
  favoritesOnly: boolean;
  here: string; // current path + query, so favorite buttons can come back here
};

export function listPage(v: ListView): Html {
  const filtering = v.q !== "" || v.tag !== "" || v.favoritesOnly;
  const body = html`
    <form class="search" method="get" action="/">
      <input type="search" name="q" value="${v.q}" placeholder="Search titles, ingredients, tags" />
      ${v.tag ? html`<input type="hidden" name="tag" value="${v.tag}" />` : ""}
      ${v.favoritesOnly ? html`<input type="hidden" name="fav" value="1" />` : ""}
      <button type="submit">Search</button>
    </form>

    <nav class="filters" aria-label="Filter by tag">
      <a class="tag ${!v.tag && !v.favoritesOnly ? "active" : ""}" href="/">all</a>
      <a class="tag ${v.favoritesOnly ? "active" : ""}" href="/?fav=1">favorites</a>
      ${v.tags.map(
        (t) =>
          html`<a class="tag ${v.tag === t.tag ? "active" : ""}" href="/?tag=${encodeURIComponent(t.tag)}"
            >${t.tag} (${t.count})</a
          >`,
      )}
    </nav>

    ${v.recipes.length === 0
      ? filtering
        ? html`<div class="empty">
            <p>No recipes match that search.</p>
            <p><a href="/">Clear filters</a></p>
          </div>`
        : html`<div class="empty">
            <p>Your recipe box is empty.</p>
            <p><a class="button" href="/recipes/new">Add your first recipe</a></p>
          </div>`
      : html`<section class="grid">${v.recipes.map((r) => card(r, v.here))}</section>`}
  `;
  return layout("Recipes", body);
}

export function viewPage(r: Recipe): Html {
  const ingredients = splitLines(r.ingredients);
  const steps = splitLines(r.steps);
  const body = html`
    <article class="recipe">
      <div class="card-top">
        <h1>${r.title}</h1>
        ${favoriteButton(r, `/recipes/${r.id}`)}
      </div>
      <p class="muted">${r.description}</p>
      <p class="muted small">${meta(r)}</p>
      <p class="tags">${tagLinks(r.tags)}</p>

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
        <a class="button" href="/recipes/${r.id}/edit">Edit</a>
        <form
          class="inline"
          method="post"
          action="/recipes/${r.id}/delete"
          onsubmit="return confirm('Delete this recipe for good?')"
        >
          <button class="danger" type="submit">Delete</button>
        </form>
        <a href="/">Back to all recipes</a>
      </div>
    </article>
  `;
  return layout(r.title, body);
}

export function formPage(opts: {
  heading: string;
  action: string;
  values: FormValues;
  error?: string;
}): Html {
  const { values: v } = opts;
  const body = html`
    <h1>${opts.heading}</h1>
    ${opts.error ? html`<p class="error" role="alert">${opts.error}</p>` : ""}
    <form class="recipe-form" method="post" action="${opts.action}">
      <label>Title
        <input name="title" value="${v.title}" required maxlength="200" />
      </label>
      <label>Description
        <input name="description" value="${v.description}" />
      </label>
      <label>Ingredients <span class="muted small">(one per line)</span>
        <textarea name="ingredients" rows="8">${v.ingredients}</textarea>
      </label>
      <label>Steps <span class="muted small">(one per line)</span>
        <textarea name="steps" rows="8">${v.steps}</textarea>
      </label>
      <label>Tags <span class="muted small">(separate with commas)</span>
        <input name="tags" value="${v.tags}" />
      </label>
      <div class="row">
        <label>Prep minutes
          <input name="prep_minutes" inputmode="numeric" value="${v.prep_minutes}" />
        </label>
        <label>Servings
          <input name="servings" inputmode="numeric" value="${v.servings}" />
        </label>
      </div>
      <div class="actions">
        <button type="submit">Save recipe</button>
        <a href="/">Cancel</a>
      </div>
    </form>
  `;
  return layout(opts.heading, body);
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

What is new:

- `tagList` became `tagLinks`: each tag is now a link to `/?tag=<tag>`. `encodeURIComponent` makes sure odd characters in a tag cannot break the link.
- `favoriteButton` is a tiny form with a star button that sends a `POST`. A hidden `next` field remembers which page it was clicked on, so you come back to the same place.
- `listPage` now takes one object, `ListView`, and draws a search form, a filter bar (all, favorites, and each tag with its count), and two different empty states: one for "no recipes yet" and one for "no recipes match".

### 3. Update the routes

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
  listTags,
  openDb,
  toggleFavorite,
  updateRecipe,
  type RecipeInput,
} from "./db";
import {
  emptyForm,
  formPage,
  listPage,
  notFoundPage,
  recipeToForm,
  viewPage,
  type FormValues,
} from "./views";

// ---------- Input checking (used by the JSON API and the HTML forms) ----------

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

// "/recipes/12" -> 12. Anything else -> null (treated as not found).
function parseId(param: string): number | null {
  return /^\d+$/.test(param) ? Number(param) : null;
}

// Only allow redirects back to a path on this site (blocks "open redirect" tricks).
function safeNext(next: unknown, fallback: string): string {
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
    return next;
  }
  return fallback;
}

const formString = (body: Record<string, unknown>, key: string) =>
  typeof body[key] === "string" ? (body[key] as string) : "";

function toFormValues(body: Record<string, unknown>): FormValues {
  return {
    title: formString(body, "title"),
    description: formString(body, "description"),
    ingredients: formString(body, "ingredients"),
    steps: formString(body, "steps"),
    tags: formString(body, "tags"),
    prep_minutes: formString(body, "prep_minutes"),
    servings: formString(body, "servings"),
  };
}

// ---------- The app ----------

export function createApp(db: Database) {
  const app = new Hono();

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

  app.get("/", (c) => {
    const q = c.req.query("q") ?? "";
    const tag = c.req.query("tag") ?? "";
    const favoritesOnly = c.req.query("fav") === "1";
    const recipes = listRecipes(db, { q, tag, favoritesOnly });
    const here = new URL(c.req.url);
    return c.html(
      listPage({
        recipes,
        tags: listTags(db),
        q,
        tag,
        favoritesOnly,
        here: here.pathname + here.search,
      }),
    );
  });

  // /recipes/new must come before /recipes/:id, or "new" would be read as an id.
  app.get("/recipes/new", (c) =>
    c.html(formPage({ heading: "New recipe", action: "/recipes", values: emptyForm })),
  );

  app.post("/recipes", async (c) => {
    const body = await c.req.parseBody();
    const parsed = parseRecipeInput(body);
    if (!parsed.ok) {
      return c.html(
        formPage({
          heading: "New recipe",
          action: "/recipes",
          values: toFormValues(body),
          error: parsed.error,
        }),
        400,
      );
    }
    const recipe = createRecipe(db, parsed.value);
    return c.redirect(`/recipes/${recipe.id}`, 303);
  });

  app.get("/recipes/:id", (c) => {
    const id = parseId(c.req.param("id"));
    const recipe = id === null ? null : getRecipe(db, id);
    if (!recipe) return c.html(notFoundPage(), 404);
    return c.html(viewPage(recipe));
  });

  app.get("/recipes/:id/edit", (c) => {
    const id = parseId(c.req.param("id"));
    const recipe = id === null ? null : getRecipe(db, id);
    if (!recipe) return c.html(notFoundPage(), 404);
    return c.html(
      formPage({
        heading: `Edit ${recipe.title}`,
        action: `/recipes/${recipe.id}`,
        values: recipeToForm(recipe),
      }),
    );
  });

  app.post("/recipes/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const recipe = id === null ? null : getRecipe(db, id);
    if (id === null || !recipe) return c.html(notFoundPage(), 404);
    const body = await c.req.parseBody();
    const parsed = parseRecipeInput(body);
    if (!parsed.ok) {
      return c.html(
        formPage({
          heading: `Edit ${recipe.title}`,
          action: `/recipes/${id}`,
          values: toFormValues(body),
          error: parsed.error,
        }),
        400,
      );
    }
    updateRecipe(db, id, parsed.value);
    return c.redirect(`/recipes/${id}`, 303);
  });

  app.post("/recipes/:id/delete", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null || !deleteRecipe(db, id)) return c.html(notFoundPage(), 404);
    return c.redirect("/", 303);
  });

  app.post("/recipes/:id/favorite", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null || !toggleFavorite(db, id)) return c.html(notFoundPage(), 404);
    const body = await c.req.parseBody();
    return c.redirect(safeNext(body.next, `/recipes/${id}`), 303);
  });

  app.notFound((c) => c.html(notFoundPage(), 404));

  return app;
}

// ---------- Start the server ----------

const PORT = Number(process.env.PORT ?? 3000);
// 127.0.0.1 means "only this computer". The app has no login, so keep it private unless you choose otherwise.
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_PATH = process.env.DB_PATH ?? "data/recipes.sqlite";

// Only start when this file is run directly (bun src/index.ts), not when a test imports it.
if (import.meta.main) {
  const db = openDb(DB_PATH);
  const app = createApp(db);
  Bun.serve({ hostname: HOST, port: PORT, fetch: app.fetch });
  console.log(`Recipe Box running at http://localhost:${PORT}`);
}
```

What is new:

- The home route reads `q`, `tag`, and `fav` from the URL, asks `listRecipes` for matching recipes, and builds the page.
- `safeNext` allows a redirect only to a path on this same site. Without it, a crafted form could bounce a visitor to any website, which is called an open redirect.
- `POST /recipes/:id/favorite` toggles the flag and redirects back to wherever the button was clicked.

### 4. Use it

```bash
cd app
bun run dev
```

Try the search box, click a tag, click the star on a recipe, and click "favorites" in the filter bar. Look at the address bar after a search: it reads something like `/?q=garlic`.

### 5. Commit

```bash
git add -A
git commit -m "Step 07: search box, tag filters, favorites with safe redirect"
```

Update `PROGRESS.md` first.

## Why

**Why does search use `GET`?** A search does not change anything, so it is a `GET`, and the search text goes in the URL: `/?q=garlic`. That means you can bookmark a search, share it, or press Back and land where you were. A `POST` search would give you none of that.

**How does the tag filter avoid false matches?** Tags are stored as `soup,quick,pie-crust`. Searching for `pie` with a plain "contains" test would also match `pie-crust` or `pizza,pie`. The query wraps both sides in commas, `,soup,quick,pie-crust,`, and looks for `,pie,`. Whole tags only. Look at `listRecipes` in `db.ts` to see it.

**Why `instr` instead of `LIKE`?** `LIKE` treats `%` and `_` in the search text as wildcards, so searching for `100%` would behave strangely. `instr(text, part)` just asks "does this text contain that text?", with no special characters to worry about. The search text is still passed as a bound `?` value, like everywhere else.

**Why lowercase everything?** Tags are stored lowercase, and search lowercases both sides. So `Pasta`, `pasta`, and `PASTA` are the same thing to a person, and they are to the database too.

**Why sort favorites first?** `ORDER BY favorite DESC, title` means "favorites on top, then alphabetical". A favorite is something you want quickly, so the list should put it where your eyes land first.

**What is an open redirect?** If your server redirects to whatever address a form says, an attacker can craft a link or form that sends your visitors from your trusted site to a bad one. Allowing only paths that start with a single `/` closes the door.

## Check

From the repo root:

```bash
bun checks/check.ts 7
```

Manual checks:

1. Search for `garlic`. Only the spaghetti recipe shows.
2. Click the `breakfast` tag. Only recipes with that tag show. (The highlight on the active tag arrives with the full styles in step 09.)
3. Click a star. The recipe moves to the top and the star fills in. Click again to undo.
4. Click `favorites` in the filter bar to see only starred recipes.
5. `curl "http://localhost:3000/api/recipes?q=garlic"` returns JSON for the same search.

Then stop. Show the human the result and ask if they have questions before step 08.
