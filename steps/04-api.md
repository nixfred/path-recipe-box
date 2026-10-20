# Step 04: The JSON API

## Goal

Let programs talk to your recipe box. You will build a JSON API: five routes that list, read, create, update, and delete recipes, with input checking and honest status codes. You will also learn the one habit that protects you from the most famous database attack, SQL injection.

## Build

**Agent:** explain what an API is and what CRUD means before writing anything, then explain status codes with the table below. Tell the human the story of SQL injection in the Why section before they see the `?` placeholders again. Write the file in sections, explaining each section first.

### 1. Replace `src/index.ts`

**File: `app/src/index.ts`** (replace the whole file)

```ts
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  openDb,
  updateRecipe,
  type RecipeInput,
} from "./db";

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

  app.get("/", (c) => c.text(`Hello from Recipe Box! You have ${listRecipes(db).length} recipes.`));

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

Walk through it:

- **`parseRecipeInput`** is the bouncer. Everything that wants to become a recipe passes through it. It requires a title, keeps it to 200 characters, turns `prep_minutes` and `servings` into whole numbers (or `null` when empty), and tidies the line based fields. It returns either `{ ok: true, value }` or `{ ok: false, error }`, so the caller must deal with both cases.
- **`parseId`** turns `"12"` into `12` and anything odd (like `"abc"`) into `null`, which we treat as "not found".
- **The five routes** map to the four basic operations, often called CRUD: Create (`POST`), Read (`GET`, one and many), Update (`PUT`), Delete (`DELETE`).
- **`c.req.json().catch(() => null)`** reads the request body as JSON, and gives us `null` instead of crashing if the body is not valid JSON.
- **`?q=`, `?tag=`, `?fav=1`** on the list route are passed straight to `listRecipes`, which you wrote in step 03. Search finds text in the title, ingredients, or tags. The tag filter matches whole tags only.

### 2. Status codes you are using

| Code | Meaning | Where |
|------|---------|-------|
| 200 | OK | Successful read, update, delete |
| 201 | Created | A new recipe was made |
| 400 | Bad request | The input was wrong (for example, no title) |
| 404 | Not found | No recipe with that id |

A status code is a number in every response that tells the caller what happened, before they read a word of the body.

### 3. Try it with curl

`curl` sends requests from the terminal. Start the server (`cd app && bun run dev`) and use another terminal.

```bash
# list everything
curl http://localhost:3000/api/recipes

# search, filter by tag
curl "http://localhost:3000/api/recipes?q=garlic"
curl "http://localhost:3000/api/recipes?tag=breakfast"

# create
curl -X POST http://localhost:3000/api/recipes \
  -H "content-type: application/json" \
  -d '{"title":"Toast","ingredients":"bread\nbutter","tags":"Breakfast, Quick","prep_minutes":5,"servings":1}'

# the create response includes "id". Put that number here
# (it is 4 on a fresh database, but it is different once you have added or deleted recipes)
ID=4

# read one
curl http://localhost:3000/api/recipes/$ID

# update (PUT replaces the whole recipe, so any field you leave out is cleared)
curl -X PUT http://localhost:3000/api/recipes/$ID \
  -H "content-type: application/json" \
  -d '{"title":"Better Toast"}'

# delete
curl -X DELETE http://localhost:3000/api/recipes/$ID

# mistakes: these should answer 400 and 404
curl -i -X POST http://localhost:3000/api/recipes -H "content-type: application/json" -d '{"description":"no title"}'
curl -i http://localhost:3000/api/recipes/99999
```

The `-i` flag shows the status line so you can see the 400 and 404.

### 4. Commit

```bash
git add -A
git commit -m "Step 04: JSON API with validation, status codes, search and tag filter"
```

Update `PROGRESS.md` first.

## Why

**What is an API?** An application programming interface: a menu of requests a program can make. Your browser pages (next step) will not use it, but it is useful anyway. Scripts, phone shortcuts, and other apps can use your recipe box through it, and it makes the app easy to test.

**Why check input?** Anyone who can reach your server can send it anything: no title, a title a million characters long, `servings` set to the word "lots". If you trust it, your data fills up with garbage, or worse. The rule is: never trust input, always check it at the edge.

**Why status codes and error messages?** A good API tells the truth. A `200` with a hidden "something went wrong" in the body forces every caller to guess. `400` means "you sent something wrong", `404` means "that does not exist". The `{ "error": "..." }` body says why.

**What is SQL injection, and why do we use `?`?** Imagine building a search like this by gluing strings together:

```ts
// NEVER do this. It is shown only so you can recognize it.
db.query("SELECT * FROM recipes WHERE title = '" + userText + "'");
```

If someone searches for `x'; DROP TABLE recipes; --`, the text becomes part of the SQL command itself, and the command now deletes your table. Every real system that did this got burned.

The fix is simple and always works: write the SQL with `?` placeholders and pass the values separately.

```ts
db.query("SELECT * FROM recipes WHERE title = ?").all(userText);
```

The database receives the command and the data as two separate things. Whatever is in `userText` is treated as plain text and can never become a command. Every query in `db.ts` does this. Your agent and you should do the same in every query you ever write.

**Why `.catch(() => null)` on the JSON read?** Because bad input is normal, not exceptional. A broken request should get a clear `400`, not crash the server.

## Check

From the repo root:

```bash
bun checks/check.ts 4
```

The checker creates and deletes its own test recipes. It also tries a SQL injection string and confirms your table survives.

Manual checks: run the curl lines above. The create should answer with a recipe that has `"tags":"breakfast,quick"` (lowercased and tidied), the bad create should answer `400`, and the missing id should answer `404`.

Then stop. Show the human the result and ask if they have questions before step 05.
