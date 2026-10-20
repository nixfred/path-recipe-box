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
