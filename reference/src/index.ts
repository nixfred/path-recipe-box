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
