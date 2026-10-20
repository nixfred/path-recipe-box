# Step 02: Hello server

## Goal

Run a real web server on your own computer and see it answer in your browser. You will add Hono (the small web framework we use), build a page that says hello, add a `/health` route that reports "I am alive", and turn on live reload so your edits show up as soon as you save.

## Build

**Agent:** before writing the file, explain the request and response idea below in your own words, using the human's own browser as the example. Then explain each piece of the code before you write it.

### 1. Install Hono

From inside `app/`:

```bash
bun add hono
```

`bun add` downloads a package and records it in `package.json` and `bun.lock`. Hono is a web framework: a small library that handles the boring parts of a server (matching URLs to code, building responses) so you write only the interesting parts.

### 2. Write the server

**File: `app/src/index.ts`** (replace the whole file)

```ts
import { Hono } from "hono";

// A function that builds the app, so tests can build a fresh one later.
export function createApp() {
  const app = new Hono();

  app.get("/", (c) => c.text("Hello from Recipe Box!"));

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
}

const PORT = Number(process.env.PORT ?? 3000);
// 127.0.0.1 means "only this computer". The app has no login, so keep it private unless you choose otherwise.
const HOST = process.env.HOST ?? "127.0.0.1";

// Only start the server when this file is run directly (bun src/index.ts).
// A test that imports this file will not start a server by accident.
if (import.meta.main) {
  Bun.serve({ hostname: HOST, port: PORT, fetch: createApp().fetch });
  console.log(`Recipe Box running at http://localhost:${PORT}`);
}
```

Walk through it with the human:

- `new Hono()` makes an app. `app.get("/", ...)` says "when a browser asks for the page at `/`, run this function and send back what it returns".
- `c` is the context: it holds the incoming request and has helpers for the response. `c.text(...)` sends plain text. `c.json(...)` sends JSON, a text format programs use to talk to each other.
- `createApp()` is a function that builds the app instead of a bare variable. It looks like extra ceremony now. It pays off in step 08, when tests need a fresh app.
- `process.env.PORT` reads a setting from the environment. If nobody set `PORT`, we use 3000. A port is a numbered door on your computer; the server listens at one.
- `HOST` defaults to `127.0.0.1`, which means "only this computer can connect". Your app has no login, so we keep it private by default. You can change it later on purpose (step 10 explains when and how).
- `if (import.meta.main)` means "only start the server if this file was run directly". A test can import the file without starting anything.
- `Bun.serve(...)` is Bun's built in web server. We hand it Hono's `fetch` function, which turns a request into a response.

### 3. Run it with live reload

```bash
bun run dev
```

That runs `bun --hot src/index.ts`. The `--hot` flag keeps the server running and swaps in your new code each time you save a file.

Open http://localhost:3000 in a browser. You should see `Hello from Recipe Box!`.

Now try the live reload. Change the message in `src/index.ts`, save, and refresh the browser. The new text should appear without restarting anything. Have the human make this change themselves.

Stop the server with Ctrl+C in the terminal when you are done.

### 4. Commit

```bash
git add -A
git commit -m "Step 02: Hono hello server with /health and live reload"
```

Update `PROGRESS.md` first.

## Why

**What is a web server?** A program that waits for requests and sends back responses. When you type a URL, your browser sends a request ("GET me `/`"). The server runs some code and replies with text, HTML, or JSON. Everything in this path, including every page and every button, is that one idea repeated.

**What does `localhost` mean?** "This computer". The server runs on your machine and nobody else can reach it. That makes it safe to experiment.

**Why a `/health` route?** It is the smallest possible "are you alive?" check. Our checker uses it to know when the server has finished starting. Real services use the same trick so monitoring tools can tell when something is down.

**Why Hono?** It is small, fast, uses standard web objects (the same `Request` and `Response` your browser uses), and runs on Bun, Node, and Cloudflare. What you learn here transfers. It has no build step and no hidden magic.

**Why read `PORT` from the environment?** Settings that change between machines (a port, a database path, later a secret) should not be written into the code. Anyone can then run the app on a different port without editing it: `PORT=3001 bun run dev`.

## Check

From the repo root:

```bash
bun checks/check.ts 2
```

Manual checks, with the server running (`cd app && bun run dev`) in one terminal and these in another:

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
```

The first prints `Hello from Recipe Box!`. The second prints `{"ok":true}`.

If you see `address already in use`, something else is using port 3000. Run on another port: `PORT=3001 bun run dev`.

Then stop. Show the human the result and ask if they have questions before step 03.
