# Step 10: Make it yours

## Goal

Finish the app and make it yours. You will add a safe backup command for your recipes, learn how to keep the app running, look at ideas for extending it, and look back at everything you learned. This is the last stage, and the first one where the choices belong to the human.

## Build

**Agent:** the build part here is small. The more important part is the conversation. After the backup script, spend most of this step asking the human what they want their recipe box to do next, and help them with it. Note any changes in `PROGRESS.md` under "Divergences".

### 1. Add a backup command

Your recipes live in one file. A backup is a second copy kept somewhere else. Add this script.

**File: `app/scripts/backup.ts`**

```ts
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
```

Then add one line to the `scripts` section of `app/package.json`, after the `test` script:

```json
"backup": "bun scripts/backup.ts"
```

Try it:

```bash
cd app
bun run backup
```

It writes `backups/recipes-<today>.sqlite`. The `backups/` folder is in `.gitignore`, so copies stay out of git. To keep real backups, copy that file somewhere that is not this computer: a cloud drive, a USB stick, or another machine.

To use a backup, stop the app, put the backup file at `data/recipes.sqlite` (move the current one aside first), and start the app again.

### 2. Keep it running (optional)

Right now the app runs while a terminal window is open. Ask the human how they want to use it.

- **Just when you cook.** Run `cd app && bun run start` when you want it and close the terminal when you are done. Nothing else is needed.
- **Always on, in the background.** Use `tmux` (a program that keeps a terminal session alive after you close the window): `tmux new -s recipes`, run `bun run start` inside, then press Ctrl+B and then D to leave it running.
- **Always on, and restarts after a reboot.** On Linux and Omarchy, a systemd user service does this. On macOS, a launchd LaunchAgent does. Offer to write one, explain each line, and ask before installing it. A minimal Linux example, with the paths changed to match this machine (find Bun's path with `which bun`: it is `/usr/bin/bun` on Arch, or `~/.bun/bin/bun` if you used the install script):

```ini
[Unit]
Description=Recipe Box

[Service]
WorkingDirectory=/home/YOU/my-recipe-box/app
ExecStart=/home/YOU/.bun/bin/bun src/index.ts
Restart=on-failure

[Install]
WantedBy=default.target
```

Save it as `~/.config/systemd/user/recipe-box.service`, then run `systemctl --user daemon-reload` and `systemctl --user enable --now recipe-box`.

**A word about sharing.** The app listens only on your own computer (`127.0.0.1`). That is deliberate: it has no login, so anyone who could reach it could read, change, or delete your recipes. To open it to other devices on your home network, start it with `HOST=0.0.0.0 bun run start`, and only do that on a network you trust. Putting it on the open internet would need a login first, which is a good project of its own.

### 3. Ideas to extend it

Pick one, or invent your own. Work it the same way as the earlier steps: plan, explain, build, check, commit.

| Idea | What you would learn |
|------|----------------------|
| Photo upload for each recipe | Handling files in a form (`multipart/form-data`), storing files on disk, serving images |
| A print view | A second layout with no chrome, plus a `?print=1` mode or its own route |
| Import and export as JSON | Reading a file upload, validating a lot of data at once, sending a download |
| A shopping list built from chosen recipes | A second table, and joining data |
| Scaling servings (double the recipe) | Parsing quantities from text, a fun small algorithm |
| Meal planner for the week | Dates, a calendar grid, a new table |
| Ratings and cooking notes | A new column or table, and a migration to change the schema safely |
| A simple login | Sessions, cookies, password hashing |

When you add a feature, add a test for it first or right after. That habit is the biggest difference between a toy and a tool.

### 4. Look back

Go through this recap with the human, and ask them to explain each line back in their own words. Where they hesitate, review that step.

| Step | What you built | The idea to keep |
|------|----------------|------------------|
| 01 Setup | A Bun project, git, a progress file | One tool, small steps, a save point after each one |
| 02 Hello server | A route that answers a browser | Request in, response out. That is all a web server does |
| 03 Database | A SQLite file with a recipes table | A database is a file you own |
| 04 API | JSON routes with checks and status codes | Never trust input. Use `?` placeholders, always |
| 05 Pages | Server rendered HTML | Escape everything. Let the template do it |
| 06 Forms | Add, edit, delete in the browser | POST, redirect, GET, so Refresh is harmless |
| 07 Search, tags, favorites | Filters you can bookmark | GET for looking, POST for changing |
| 08 Tests | Automated checks with temp databases | Tests are what let you change things without fear |
| 09 Style | A dark, responsive stylesheet | Small CSS, real accessibility |
| 10 Make it yours | Backups and a path forward | Your data is a file. Back it up |

### 5. Final commit

Update `PROGRESS.md` with the final entry, including what the human wants to build next. Then:

```bash
git add -A
git commit -m "Step 10: backup script, final polish, recipe box complete"
```

Pushing is the human's call (CLAUDE.md rule 13), so only do it if they ask. The template command in the README already created their own private repo on GitHub, so when they ask, run `git status` first to confirm no database file or secret is about to go up, then `git push`.

## Why

**Why back up with `VACUUM INTO` instead of copying the file?** Because of WAL mode (step 03). Recent changes may still be in the `-wal` side file, so copying only `recipes.sqlite` can give you a copy that is missing your latest recipes. `VACUUM INTO` asks SQLite itself to write a complete, consistent copy, even while the app is running.

**Why keep backups off this computer?** A backup on the same disk protects you from your own mistakes, not from a dead drive or a lost laptop. The rule of thumb is simple: if it exists in only one place, it does not exist.

**Why does the app listen only on your own computer by default?** Safe defaults. A beginner should not have to know that a web app can be reached by neighbors on the same network. Opening it up is one environment variable, and it is your decision.

**Why keep going after "done"?** The point of this path was never only the recipe box. You now have an agent that can teach and build with you, and you understand how a small web app is put together from the browser down to the file on disk. The next project can use the same pattern.

## Check

From the repo root:

```bash
bun checks/check.ts 10
```

That runs all ten stages, so a pass means the whole app is healthy.

Manual checks:

- `cd app && bun run backup` prints `Backup written to backups/recipes-...sqlite`.
- `bun test` still passes in `app/`.
- The human can say, in their own words, what happens between clicking "Save recipe" and seeing the recipe page (the form travels as a `POST`, the server checks it and writes to SQLite, then redirects, and the browser makes a `GET`).
- `git status` is clean, and `git log --oneline` shows one commit per step.

Then congratulate the human, honestly: they built a working app, they have an agent that helped them do it, and they understand how both work. Ask what they want to build next.
