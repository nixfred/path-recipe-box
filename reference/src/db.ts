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
