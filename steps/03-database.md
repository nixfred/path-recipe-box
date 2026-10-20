# Step 03: The database

## Goal

Give the app a memory. You will create a SQLite database file, define a `recipes` table, fill it with three sample recipes the first time the app runs, and write the small set of functions the rest of the app will use to read and write recipes.

## Build

**Agent:** this is the step where the human learns what a database is. Before writing `src/db.ts`, explain tables, rows, and columns using a spreadsheet as the comparison. Go through the file in sections, explaining each one before you write it.

### 1. Write `src/db.ts`

**File: `app/src/db.ts`**

```ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ---------- Types ----------

export type Recipe = {
  id: number;
  title: string;
  description: string;
  ingredients: string; // one per line
  steps: string; // one per line
  tags: string; // comma separated, normalized (lowercase, no duplicates)
  prep_minutes: number | null;
  servings: number | null;
  favorite: number; // 0 or 1
  created_at: string;
  updated_at: string;
};

export type RecipeInput = {
  title: string;
  description: string;
  ingredients: string;
  steps: string;
  tags: string;
  prep_minutes: number | null;
  servings: number | null;
};

export type ListOptions = { q?: string; tag?: string; favoritesOnly?: boolean };

// ---------- Helpers ----------

// "Pasta, Quick,pasta" -> "pasta,quick"
export function normalizeTags(raw: string): string {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen].join(",");
}

const now = () => new Date().toISOString();

// ---------- Open + schema ----------

export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.run("PRAGMA journal_mode = WAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      ingredients  TEXT NOT NULL DEFAULT '',
      steps        TEXT NOT NULL DEFAULT '',
      tags         TEXT NOT NULL DEFAULT '',
      prep_minutes INTEGER,
      servings     INTEGER,
      favorite     INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    )
  `);
  seedIfEmpty(db);
  return db;
}

// ---------- Queries (every value is a bound parameter) ----------

export function listRecipes(db: Database, opts: ListOptions = {}): Recipe[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  const q = opts.q?.trim().toLowerCase();
  if (q) {
    where.push(
      "(instr(lower(title), ?) > 0 OR instr(lower(ingredients), ?) > 0 OR instr(tags, ?) > 0)",
    );
    params.push(q, q, q);
  }

  const tag = opts.tag?.trim().toLowerCase();
  if (tag) {
    // Wrap both sides in commas so "pie" does not match "pizza,pie-crust".
    where.push("instr(',' || tags || ',', ',' || ? || ',') > 0");
    params.push(tag);
  }

  if (opts.favoritesOnly) where.push("favorite = 1");

  const sql =
    "SELECT * FROM recipes" +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY favorite DESC, title COLLATE NOCASE ASC";
  return db.query(sql).all(...params) as Recipe[];
}

export function getRecipe(db: Database, id: number): Recipe | null {
  return (db.query("SELECT * FROM recipes WHERE id = ?").get(id) as Recipe) ?? null;
}

export function createRecipe(db: Database, input: RecipeInput): Recipe {
  const ts = now();
  const result = db
    .query(
      `INSERT INTO recipes
        (title, description, ingredients, steps, tags, prep_minutes, servings, favorite, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      input.title,
      input.description,
      input.ingredients,
      input.steps,
      normalizeTags(input.tags),
      input.prep_minutes,
      input.servings,
      ts,
      ts,
    );
  return getRecipe(db, Number(result.lastInsertRowid))!;
}

export function updateRecipe(db: Database, id: number, input: RecipeInput): Recipe | null {
  const result = db
    .query(
      `UPDATE recipes SET
        title = ?, description = ?, ingredients = ?, steps = ?, tags = ?,
        prep_minutes = ?, servings = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.title,
      input.description,
      input.ingredients,
      input.steps,
      normalizeTags(input.tags),
      input.prep_minutes,
      input.servings,
      now(),
      id,
    );
  return result.changes > 0 ? getRecipe(db, id) : null;
}

export function deleteRecipe(db: Database, id: number): boolean {
  return db.query("DELETE FROM recipes WHERE id = ?").run(id).changes > 0;
}

// ---------- Seed (first run only) ----------

function seedIfEmpty(db: Database) {
  const row = db.query("SELECT COUNT(*) AS n FROM recipes").get() as { n: number };
  if (row.n > 0) return;

  const samples: RecipeInput[] = [
    {
      title: "Fluffy Pancakes",
      description: "A simple stack for a slow morning.",
      ingredients: [
        "1 1/2 cups flour",
        "3 1/2 tsp baking powder",
        "1 tbsp sugar",
        "1/4 tsp salt",
        "1 1/4 cups milk",
        "1 egg",
        "3 tbsp melted butter",
      ].join("\n"),
      steps: [
        "Whisk the flour, baking powder, sugar, and salt in a large bowl.",
        "Whisk the milk, egg, and melted butter in a second bowl.",
        "Pour the wet mix into the dry mix and stir until just combined. Lumps are fine.",
        "Heat a lightly oiled pan over medium heat.",
        "Pour 1/4 cup of batter per pancake. Flip when bubbles form, about 2 minutes. Cook the other side until golden.",
      ].join("\n"),
      tags: "breakfast, sweet, quick",
      prep_minutes: 20,
      servings: 4,
    },
    {
      title: "Garlic Spaghetti",
      description: "Pantry pasta with garlic, olive oil, and chili flakes.",
      ingredients: [
        "200 g spaghetti",
        "4 cloves garlic, sliced thin",
        "1/3 cup olive oil",
        "1/2 tsp chili flakes",
        "Salt",
        "Chopped parsley",
      ].join("\n"),
      steps: [
        "Boil the spaghetti in well salted water until just tender. Save a cup of the pasta water.",
        "Warm the olive oil and garlic in a pan over low heat until the garlic is pale gold.",
        "Add the chili flakes, then the drained pasta and a splash of pasta water.",
        "Toss for a minute until glossy. Finish with parsley.",
      ].join("\n"),
      tags: "dinner, pasta, quick, vegetarian",
      prep_minutes: 20,
      servings: 2,
    },
    {
      title: "Classic Guacamole",
      description: "Chunky, bright, and ready in ten minutes.",
      ingredients: [
        "3 ripe avocados",
        "1 lime, juiced",
        "1/2 small red onion, finely diced",
        "1 small tomato, diced",
        "Handful of cilantro, chopped",
        "Salt",
      ].join("\n"),
      steps: [
        "Halve the avocados, remove the pits, and scoop the flesh into a bowl.",
        "Mash with a fork, leaving some chunks.",
        "Stir in the lime juice, onion, tomato, cilantro, and a pinch of salt.",
        "Taste and add more salt or lime. Serve right away.",
      ].join("\n"),
      tags: "snack, vegetarian, quick",
      prep_minutes: 10,
      servings: 4,
    },
  ];

  for (const sample of samples) createRecipe(db, sample);
}
```

Walk through the sections:

- **Types.** `Recipe` describes a row as it comes out of the database. `RecipeInput` describes what a person gives us when creating or editing (no id, no timestamps, no favorite flag yet). Naming these shapes lets TypeScript warn us about typos.
- **`normalizeTags`.** People type `Pasta, quick,PASTA`. We store `pasta,quick`: lowercase, trimmed, no duplicates. Cleaning data once on the way in keeps every later search simple.
- **`openDb`.** Opens (or creates) the database file, switches on WAL mode, creates the table if it is missing, and seeds sample data. `CREATE TABLE IF NOT EXISTS` is safe to run every time the app starts.
- **The queries.** Every function takes the database and does one job: list, get one, create, update, delete. Look closely at the `?` marks. We will return to those in step 04, because they are the most important safety feature in this file.
- **`seedIfEmpty`.** Counts the rows. Only if there are none does it add three sample recipes, so your own recipes are never overwritten.

Two of the functions in the final app are not here yet (`toggleFavorite` and `listTags`). We add them in step 07, when they are needed.

### 2. Open the database when the server starts

**File: `app/src/index.ts`** (replace the whole file)

```ts
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { listRecipes, openDb } from "./db";

export function createApp(db: Database) {
  const app = new Hono();

  app.get("/", (c) => c.text(`Hello from Recipe Box! You have ${listRecipes(db).length} recipes.`));

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}

const PORT = Number(process.env.PORT ?? 3000);
// 127.0.0.1 means "only this computer". The app has no login, so keep it private unless you choose otherwise.
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_PATH = process.env.DB_PATH ?? "data/recipes.sqlite";

if (import.meta.main) {
  const db = openDb(DB_PATH);
  Bun.serve({ hostname: HOST, port: PORT, fetch: createApp(db).fetch });
  console.log(`Recipe Box running at http://localhost:${PORT} (database: ${DB_PATH})`);
}
```

The changes: `createApp` now receives the database, `DB_PATH` is read from the environment (defaulting to `data/recipes.sqlite`), and the home page reports how many recipes exist.

### 3. Run it

```bash
cd app
bun run dev
```

The first run creates the `data/` folder and the database file. Open http://localhost:3000. It should say you have 3 recipes. Stop the server and start it again: it still says 3, not 6. That is the "seed only when empty" rule working.

Look inside the database with a one line script:

```bash
bun -e 'import { Database } from "bun:sqlite"; console.log(new Database("data/recipes.sqlite", { readonly: true }).query("SELECT id, title, tags FROM recipes").all())'
```

### 4. Commit

```bash
git add -A
git commit -m "Step 03: SQLite database with schema, seed data, and query functions"
```

Check that `git status` does not list anything inside `app/data/`. If it does, the `.gitignore` from step 01 is missing a line. Update `PROGRESS.md` before committing.

## Why

**Why SQLite?** It is a complete database stored in one ordinary file. There is no server to install, no password, and no account. The file `data/recipes.sqlite` is your recipe box. You can copy it, back it up, email it, or delete it. It is a file you own. SQLite is also one of the most widely deployed pieces of software on Earth, so what you learn here carries over.

**Why a database and not a text file?** A database gives you searching, sorting, and safe updates for free. It can handle two things happening at once without corrupting your data, which a plain file cannot.

**Why `bun:sqlite`?** Bun ships with SQLite built in. No package to install, no native code to compile, and it works the same on macOS and Linux.

**What is WAL mode?** WAL means write ahead log. Instead of rewriting the main file for every change, SQLite first appends changes to a side file, and merges them in later. Readers are never blocked by a writer, and a crash in the middle of a write is far less likely to damage the file. You will see extra files named `-wal` and `-shm` next to your database. That is normal, and the `.gitignore` already covers them.

**Why timestamps as text?** `new Date().toISOString()` gives text like `2026-01-31T15:04:05.000Z`. It sorts correctly, any language can read it, and it is easy to see when you look inside the file.

**Why `favorite` is `0` or `1`.** SQLite has no true/false type. Convention is `0` for no and `1` for yes.

**Why store ingredients and steps as text with one item per line?** It keeps the table to one simple row per recipe, which is the right amount of database for a first project. The tradeoff is that you cannot easily ask "which recipes use garlic?" with exact precision. For a personal recipe box, searching the text is plenty.

## Check

From the repo root:

```bash
bun checks/check.ts 3
```

Manual checks:

- `ls app/data` shows `recipes.sqlite`.
- Restarting the server does not duplicate the sample recipes.
- Deleting the `app/data` folder (ask your human first) and restarting makes a fresh database with 3 recipes again.

Then stop. Show the human the result and ask if they have questions before step 04.
