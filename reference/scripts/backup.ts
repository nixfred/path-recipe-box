// Make a safe copy of your recipe database.
//   bun run backup                 -> backups/recipes-YYYY-MM-DD.sqlite
//   bun run backup my-copy.sqlite  -> that file
//
// VACUUM INTO writes a complete, consistent copy even while the server is
// running. (Copying the .sqlite file by hand can miss recent changes that
// still live in the -wal file.)
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const source = process.env.DB_PATH ?? "data/recipes.sqlite";
const stamp = new Date().toISOString().slice(0, 10);
const target = process.argv[2] ?? `backups/recipes-${stamp}.sqlite`;

if (!existsSync(source)) {
  console.error(`No database at ${source}. Start the app once first.`);
  process.exit(1);
}
if (existsSync(target)) {
  console.error(`${target} already exists. Pick another name or move it first.`);
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
const db = new Database(source, { readonly: true });
db.query("VACUUM INTO ?").run(target);
db.close();
console.log(`Backup written to ${target}`);
