# Step 06: Forms

## Goal

Add, edit, and delete recipes from the browser using plain HTML forms. No JavaScript needed. You will learn how a form travels from a browser to your server, and why every successful form submit ends with a redirect.

## Build

**Agent:** before writing, explain the form lifecycle with the numbered list in the Why section, then write the code. Have the human use the finished forms in the browser themselves.

### 1. Add the form page and buttons to the views

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
          <a class="button" href="/recipes/new">New recipe</a>
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
      ? html`<div class="empty">
          <p>Your recipe box is empty.</p>
          <p><a class="button" href="/recipes/new">Add your first recipe</a></p>
        </div>`
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

- `FormValues`, `emptyForm`, and `recipeToForm` describe the form's fields as text, since that is all a browser sends.
- `formPage` draws the form, used for both "new" and "edit". When it is given an `error` it shows a message, and because it receives the values the person already typed, nothing they wrote is lost.
- The layout has a "New recipe" button, the recipe page has Edit and Delete buttons, and the empty list invites the human to add a first recipe.
- The delete button lives in its own tiny form so it sends a `POST`. The `onsubmit` asks "Delete this recipe for good?" first. That one line of inline JavaScript is the only script in the whole app.

### 2. Add the form routes

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
import {
  emptyForm,
  formPage,
  listPage,
  notFoundPage,
  recipeToForm,
  viewPage,
  type FormValues,
} from "./views";

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

const formString = (body: Record<string, unknown>, key: string) =>
  typeof body[key] === "string" ? (body[key] as string) : "";

// Turn a submitted form back into the shape the form page needs, so a
// mistake never wipes out what the person typed.
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

What is new:

- `GET /recipes/new` shows the empty form. **Order matters:** it must be registered before `GET /recipes/:id`. Otherwise Hono would match the word `new` as an id and show "Not found".
- `POST /recipes` reads the form with `c.req.parseBody()`, validates it with the same `parseRecipeInput` the API uses, then either re-draws the form with a `400` and the error, or creates the recipe and redirects.
- `GET /recipes/:id/edit` shows the form already filled in. `POST /recipes/:id` saves it.
- `POST /recipes/:id/delete` deletes and redirects home.
- `toFormValues` turns what the browser sent back into the shape the form needs, so mistakes do not wipe out the person's typing.

### 3. Use it

```bash
cd app
bun run dev
```

In the browser: add a recipe, edit it, then delete it. Try submitting the new recipe form with the title left blank (remove the `required` attribute in your browser's developer tools if you want to bypass it, or send it with curl) and see the error message appear with your other fields intact.

### 4. Commit

```bash
git add -A
git commit -m "Step 06: add, edit and delete recipes with HTML forms, POST redirect GET"
```

Update `PROGRESS.md` first.

## Why

**How does a form work?**

1. The browser shows `<form method="post" action="/recipes">` with some inputs.
2. You fill it in and press the button.
3. The browser sends a `POST` request to `/recipes` with the values in the body, as `title=Toast&tags=breakfast`.
4. Your server reads those values, checks them, and saves.
5. The server answers with a redirect, which tells the browser "go look at `/recipes/4` instead".
6. The browser makes a new `GET` request for that page and shows it.

**Why redirect after a POST?** This is the POST, redirect, GET pattern. If the server answered a `POST` with a page directly, then pressing Refresh would make the browser say "resubmit the form?", and saying yes would create a duplicate recipe. After a redirect, the page you are looking at is the result of a harmless `GET`. Refresh it all day.

**Why status 303?** It means "See Other": after your `POST`, go fetch this other page with `GET`. It is the exact right code for this pattern.

**Why GET for looking, POST for changing?** `GET` must never change anything. Browsers, search engines, and link previews freely repeat `GET` requests. Anything that adds, edits, or deletes uses `POST`. Browsers can only send `GET` and `POST` from plain forms, which is why edit and delete use `POST` with a descriptive URL.

**Why check the input again when the browser already has `required`?** Browser checks are a courtesy to the human, not security. Anyone can send a request without a browser. The server is the only place a rule is really enforced, and we reuse the one `parseRecipeInput` for both the API and the forms so the rules cannot drift apart.

**Why keep what the person typed after an error?** Losing a long list of ingredients to a missing title is infuriating. Sending the values back into the form is a small kindness that makes the app feel finished.

## Check

From the repo root:

```bash
bun checks/check.ts 6
```

Manual checks:

1. Add a recipe in the browser. After saving you land on its page. Press Refresh. No duplicate appears.
2. Edit it, change the title, and save. The new title shows.
3. Delete it. You return to the list and it is gone.
4. `curl -i -X POST http://localhost:3000/recipes -d "title=Curl Cake"` answers `303` with a `location:` header. This adds a real recipe called Curl Cake, so delete it before moving on to keep your list clean.
5. `curl -i -X POST http://localhost:3000/recipes -d "title="` answers `400` and returns the form with an error.

Then stop. Show the human the result and ask if they have questions before step 07.
