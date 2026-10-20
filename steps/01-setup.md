# Step 01: Setup

## Goal

Get your tools and your project folder ready, so every later step can focus on building. By the end you will have Bun installed and working, a fresh Bun project inside `app/`, a first line of TypeScript running, and your first git commit.

## Build

**Agent:** you are teaching, not just typing. Before each numbered item below, explain in a few plain sentences what you are about to do and why. Define any new word the first time you use it. Ask the human before installing anything.

### 1. Check for Bun

Bun is the tool that runs our TypeScript code, installs packages, runs tests, and even gives us a built in database. One tool instead of four.

```bash
bun --version
```

If that prints a version number (this path was built with Bun 1.3 and checked again from a fresh clone with Bun 1.4.3 on Linux, and any recent version should work), skip ahead to item 2.

If the command is not found, Bun is not installed yet. Tell the human the two common ways to install it, and ask which they want you to run. Do not run either without a yes.

macOS with Homebrew:

```bash
brew install oven-sh/bun/bun
```

Linux, including Omarchy (Arch Linux):

```bash
curl -fsSL https://bun.sh/install | bash
```

After installing, the human may need to open a new terminal window (or run `source ~/.bashrc` or `source ~/.zshrc`) so the `bun` command is found. Then run `bun --version` again.

### 2. Create the Bun project inside `app/`

`app/` already exists and holds one file, `app/README.md`. This is where your recipe box will live.

```bash
cd app
bun init -y
```

`bun init -y` means "set up a project and accept the default answers". It creates these files:

| File | What it is |
|------|------------|
| `package.json` | The project's ID card: its name, its scripts, and the packages it uses |
| `tsconfig.json` | Settings for TypeScript, the typed flavor of JavaScript |
| `.gitignore` | A list of files git should never track |
| `bun.lock` | A record of the exact package versions installed, so everyone gets the same ones |
| `node_modules/` | The downloaded packages themselves (never committed to git) |
| `index.ts` | A starter file we will not use |
| `CLAUDE.md` | A generic notes file Bun writes for AI tools |

It leaves your existing `app/README.md` alone.

### 3. Tidy up what `bun init` made

Remove two files. Explain why to the human first, and ask before deleting.

- Delete `app/index.ts`. We will put our code in `app/src/index.ts` instead, so the code has a proper home as the project grows.
- Delete `app/CLAUDE.md`. The repo root already has a `CLAUDE.md` with the rules for this path. A second one inside `app/` would add generic instructions that can compete with it.

### 4. Set up `package.json`

Open `app/package.json`. Change it so the name, the module type, and the scripts match the file below. Remove the `"module": "index.ts"` line, since that file is gone. Keep whatever version numbers `bun init` wrote for the two dependency sections (the `typescript` range in the sample below is only an example). If `bun init` also added a `typecheck` script, you can keep it: `bun check` runs TypeScript's type checker.

**File: `app/package.json`** (target shape, your version numbers may differ)

```json
{
  "name": "recipe-box",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "start": "bun src/index.ts",
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^7"
  }
}
```

Explain the three scripts: `dev` runs the app and reloads it when you save a file, `start` runs it plainly, `test` runs the tests we write in step 08. You run a script with `bun run dev`.

### 5. Keep your data out of git

Your recipes will live in a database file. That file belongs to you and should not be committed by accident. Add these lines to the end of `app/.gitignore`:

```
# Recipe Box data
data/
backups/
*.sqlite
*.sqlite-wal
*.sqlite-shm
*.db
```

### 6. Write the first line of code

**File: `app/src/index.ts`**

```ts
console.log("Recipe Box is alive. Bun version:", Bun.version);
```

Run it from inside `app/`:

```bash
bun src/index.ts
```

It should print one line and exit. That proves Bun can run your TypeScript.

### 7. Start your progress file

Create `PROGRESS.md` in the repo root (one level above `app/`) using the template in `CLAUDE.md`. Write the Step 01 entry together with the human, including one thing in their own words that they learned. A future session will read this file to know where you left off.

### 8. Make your first commit

Git is a time machine for your project. A commit is a saved snapshot with a message. From the repo root:

```bash
git status
git add -A
git commit -m "Step 01: Bun project set up in app/"
```

`git status` shows what changed, `git add -A` selects everything for the snapshot, and `git commit` saves it. You will commit at the end of every stage, so you can always go back to a working version.

## Why

**Why Bun?** It replaces a runtime, a package manager, a test runner, and a SQLite library with one fast install. Fewer tools means fewer things to configure and fewer ways for a beginner to get stuck. It runs TypeScript directly, with no build step.

**Why TypeScript?** It is JavaScript with labels on your data ("this is a number, this is text"). Your editor and your agent catch mistakes before the code runs. You will see only a little of it in this path, and it will mostly just feel like normal code.

**Why `src/`?** A project grows. Putting source code in one folder keeps config files, data, tests, and code from piling up in one place.

**Why a `.gitignore` before any data exists?** Because the mistake it prevents (committing your database, or a secret) is easy to make and annoying to undo. Git remembers everything you ever commit, even after you delete the file.

**Why commit now?** A commit is a save point you can return to. Small, frequent commits make it safe to experiment.

## Check

Run from the repo root:

```bash
bun checks/check.ts 1
```

Every line should say PASS. If one says FAIL, read its hint, fix that one thing, and run it again.

Manual checks:

- `bun --version` prints a version.
- `cd app && bun src/index.ts` prints `Recipe Box is alive` and your Bun version.
- `git log --oneline` shows your first commit.

Then stop here. Tell the human what you did, show the check result, and ask whether they have questions before step 02.
