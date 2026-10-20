# Step 09: Style and polish

## Goal

Make it feel good to use. You will replace the starter stylesheet with a clean dark design that works on a phone, has visible keyboard focus, and prints nicely. Along the way you will see how one small CSS file can style the whole app.

## Build

**Agent:** explain what CSS is (rules that say how HTML elements look) before writing the file. Then explain the file in its sections. Most of the app's markup already has the class names this stylesheet needs, since you wrote them in the earlier steps.

### 1. Replace the stylesheet

**File: `app/public/style.css`** (replace the whole file)

```css
/* Recipe Box: one small stylesheet. Dark, readable, no framework. */

:root {
  --bg: #0f1115;
  --panel: #171a21;
  --panel-2: #1e222b;
  --border: #2b303b;
  --text: #e8eaf0;
  --muted: #9aa3b2;
  --accent: #f5a65b;
  --accent-ink: #1a1207;
  --danger: #ef6b6b;
  --radius: 10px;
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

main {
  max-width: 960px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
}

a {
  color: var(--accent);
}

h1,
h2 {
  line-height: 1.25;
  margin: 0 0 0.5rem;
}

h1 {
  font-size: 1.8rem;
}

h2 {
  font-size: 1.15rem;
}

.muted {
  color: var(--muted);
  margin: 0.25rem 0;
}

.small {
  font-size: 0.875rem;
}

/* Header */

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 960px;
  margin: 0 auto;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.brand {
  color: var(--text);
  font-weight: 700;
  font-size: 1.25rem;
  text-decoration: none;
}

/* Buttons and inputs */

button,
.button {
  display: inline-block;
  background: var(--accent);
  color: var(--accent-ink);
  border: 0;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

button:hover,
.button:hover {
  filter: brightness(1.1);
}

button.danger {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
}

input,
textarea {
  width: 100%;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  font: inherit;
}

textarea {
  resize: vertical;
}

a:focus-visible,
button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

form.inline {
  display: inline;
  margin: 0;
}

/* Search and filters */

.search {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1.5rem;
}

.tag {
  display: inline-block;
  background: var(--panel-2);
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.1rem 0.7rem;
  font-size: 0.85rem;
  text-decoration: none;
}

.tag:hover,
.tag.active {
  color: var(--accent-ink);
  background: var(--accent);
  border-color: var(--accent);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.5rem 0 0;
}

/* Cards */

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.1rem;
}

.card:hover {
  border-color: var(--accent);
}

.card h2 a {
  color: var(--text);
  text-decoration: none;
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.star {
  background: transparent;
  color: var(--muted);
  padding: 0 0.25rem;
  font-size: 1.4rem;
  line-height: 1;
}

.star.on {
  color: var(--accent);
}

/* Recipe page */

.recipe .columns {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  margin: 1.5rem 0;
}

.recipe ul,
.recipe ol {
  padding-left: 1.25rem;
  margin: 0;
}

.recipe li {
  margin-bottom: 0.4rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
}

/* Form */

.recipe-form {
  display: grid;
  gap: 1rem;
  max-width: 640px;
}

.recipe-form label {
  display: grid;
  gap: 0.3rem;
  font-weight: 600;
}

.recipe-form label .muted {
  font-weight: 400;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.error {
  background: rgba(239, 107, 107, 0.12);
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
}

/* Empty states */

.empty {
  text-align: center;
  color: var(--muted);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 2.5rem 1rem;
}

/* Small screens */

@media (max-width: 640px) {
  .recipe .columns,
  .row {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .search {
    flex-direction: column;
  }
}

/* Printing: plain black on white, no chrome */

@media print {
  body {
    background: #fff;
    color: #000;
  }

  .site-header,
  .actions,
  .star,
  .search,
  .filters {
    display: none;
  }

  a {
    color: #000;
  }
}
```

Walk through the sections:

- **`:root` variables.** Colors and sizes are named once (`--bg`, `--accent`, and so on) and reused everywhere. To change the whole theme, change a handful of lines here. `color-scheme: dark` tells the browser to draw its built in controls (scrollbars, form widgets) in dark too.
- **Layout.** `main` is centered with a maximum width so lines of text stay readable. The `.grid` uses `repeat(auto-fill, minmax(260px, 1fr))`: as many 260 pixel cards per row as fit, each growing to share the space. No media query needed.
- **Buttons, inputs, tags.** One consistent look for each, using the variables.
- **Focus styles.** `:focus-visible` draws an outline when you navigate with the keyboard. Many people depend on this, and removing it is a common accessibility mistake.
- **`@media (max-width: 640px)`.** On narrow screens the two column recipe layout becomes one column and the search box stacks.
- **`@media print`.** Printing a recipe gives black text on white paper, with the header, buttons, and filters hidden.

### 2. Empty states and the 404 page

Your views already handle these, and the CSS now styles them. Check each one in the browser:

- Search for something that matches nothing, like `zzzz`. You should see "No recipes match that search" with a link to clear the filters.
- Open a missing page like http://localhost:3000/nope. You should see the styled "Not found" page, not a blank screen.
- (Optional) Temporarily point `DB_PATH` at a new file, `DB_PATH=data/empty-test.sqlite bun run dev` (from inside `app/`, so the file stays in the git-ignored `data/` folder), and delete the three seeded recipes. The home page should invite you to add your first recipe.

### 3. Look at it in a few conditions

With the server running, ask the human to:

- Narrow the browser window and watch the layout rearrange.
- Press Tab repeatedly and watch the focus outline move through links and buttons.
- Open the print preview on a recipe page (Cmd+P on macOS, Ctrl+P on Linux).

### 4. Commit

```bash
git add -A
git commit -m "Step 09: dark responsive stylesheet with focus styles, print styles, empty states"
```

Update `PROGRESS.md` first.

## Why

**Why one plain CSS file?** There is nothing to install or compile. You can open the file, change `--accent` to another color, save, and see it instantly with live reload. A framework would add a lot of weight for a small app.

**Why dark by default?** Easier on the eyes in the kitchen at night. If you prefer light, the variables at the top are the only place you need to touch.

**Why make it work on a phone?** A recipe box is used while cooking, often on a phone propped against the flour. The `viewport` tag in the layout plus a couple of small screen rules cost almost nothing and make the app usable where you actually need it.

**Why care about focus outlines and contrast?** Accessibility is not a bonus feature. Anyone who navigates by keyboard needs to see where they are, and anyone in a dim or bright room needs readable text. Doing it from the start is far easier than fixing it later.

**Why polish empty states and errors?** Apps spend a surprising amount of time in "nothing here yet" and "that does not exist" situations. A friendly sentence and a next step turn a dead end into a signpost.

## Check

From the repo root:

```bash
bun checks/check.ts 9
```

Manual checks:

1. http://localhost:3000/style.css loads the stylesheet in the browser.
2. The home page is dark, readable, and shows cards in a grid.
3. Narrowing the window rearranges the layout and nothing overflows sideways.
4. Tab shows a clear outline on every link and button.
5. A search with no matches shows a friendly message.

Then stop. Show the human the result and ask if they have questions before step 10.
