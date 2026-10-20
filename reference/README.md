# reference

The finished Recipe Box: the answer key for the path. Your agent does not copy from here unless you ask, or it is stuck after two real attempts.

```bash
bun install
bun run dev      # http://localhost:3000, reloads when you save
bun test         # unit and route tests
bun run backup   # safe copy of the database into backups/
```

Environment settings (all optional): `PORT` (default 3000), `HOST` (default `127.0.0.1`), `DB_PATH` (default `data/recipes.sqlite`).

From the repo root, check it with `bun checks/check.ts 10 --dir reference`.
