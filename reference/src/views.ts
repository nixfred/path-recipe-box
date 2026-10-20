import { html } from "hono/html";
import type { Recipe } from "./db";

// html`...` is a tagged template. Every ${value} you put inside is HTML-escaped
// automatically, so a recipe titled <script>alert(1)</script> is shown as plain
// text instead of running. Never build HTML by gluing strings together yourself.
type Html = ReturnType<typeof html>;

export type FormValues = {
  title: string;
  description: string;
  ingredients: string;
  steps: string;
  tags: string;
  prep_minutes: string;
  servings: string;
};

export const emptyForm: FormValues = {
  title: "",
  description: "",
  ingredients: "",
  steps: "",
  tags: "",
  prep_minutes: "",
  servings: "",
};

export function recipeToForm(r: Recipe): FormValues {
  return {
    title: r.title,
    description: r.description,
    ingredients: r.ingredients,
    steps: r.steps,
    tags: r.tags,
    prep_minutes: r.prep_minutes?.toString() ?? "",
    servings: r.servings?.toString() ?? "",
  };
}

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

// ---------- Layout ----------

export function layout(title: string, body: Html): Html {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>${title} | Recipe Box</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <header class="site-header">
          <a class="brand" href="/">Recipe Box</a>
          <a class="button" href="/recipes/new">New recipe</a>
        </header>
        <main>${body}</main>
      </body>
    </html>`;
}

// ---------- Small pieces ----------

function tagLinks(tags: string): Html {
  const list = tags ? tags.split(",") : [];
  return html`${list.map((t) => html`<a class="tag" href="/?tag=${encodeURIComponent(t)}">${t}</a>`)}`;
}

function favoriteButton(r: Recipe, next: string): Html {
  return html`<form class="inline" method="post" action="/recipes/${r.id}/favorite">
    <input type="hidden" name="next" value="${next}" />
    <button
      class="star ${r.favorite ? "on" : ""}"
      type="submit"
      aria-label="${r.favorite ? "Remove from favorites" : "Add to favorites"}"
      title="${r.favorite ? "Remove from favorites" : "Add to favorites"}"
    >
      ${r.favorite ? "★" : "☆"}
    </button>
  </form>`;
}

function meta(r: Recipe): Html {
  const bits: string[] = [];
  if (r.prep_minutes !== null) bits.push(`${r.prep_minutes} min`);
  if (r.servings !== null) bits.push(`serves ${r.servings}`);
  return html`${bits.join(" · ")}`;
}

function card(r: Recipe, here: string): Html {
  return html`<article class="card">
    <div class="card-top">
      <h2><a href="/recipes/${r.id}">${r.title}</a></h2>
      ${favoriteButton(r, here)}
    </div>
    <p class="muted">${r.description}</p>
    <p class="muted small">${meta(r)}</p>
    <p class="tags">${tagLinks(r.tags)}</p>
  </article>`;
}

// ---------- Pages ----------

export type ListView = {
  recipes: Recipe[];
  tags: { tag: string; count: number }[];
  q: string;
  tag: string;
  favoritesOnly: boolean;
  here: string; // current path + query, so favorite buttons can come back here
};

export function listPage(v: ListView): Html {
  const filtering = v.q !== "" || v.tag !== "" || v.favoritesOnly;
  const body = html`
    <form class="search" method="get" action="/">
      <input type="search" name="q" value="${v.q}" placeholder="Search titles, ingredients, tags" />
      ${v.tag ? html`<input type="hidden" name="tag" value="${v.tag}" />` : ""}
      ${v.favoritesOnly ? html`<input type="hidden" name="fav" value="1" />` : ""}
      <button type="submit">Search</button>
    </form>

    <nav class="filters" aria-label="Filter by tag">
      <a class="tag ${!v.tag && !v.favoritesOnly ? "active" : ""}" href="/">all</a>
      <a class="tag ${v.favoritesOnly ? "active" : ""}" href="/?fav=1">favorites</a>
      ${v.tags.map(
        (t) =>
          html`<a class="tag ${v.tag === t.tag ? "active" : ""}" href="/?tag=${encodeURIComponent(t.tag)}"
            >${t.tag} (${t.count})</a
          >`,
      )}
    </nav>

    ${v.recipes.length === 0
      ? filtering
        ? html`<div class="empty">
            <p>No recipes match that search.</p>
            <p><a href="/">Clear filters</a></p>
          </div>`
        : html`<div class="empty">
            <p>Your recipe box is empty.</p>
            <p><a class="button" href="/recipes/new">Add your first recipe</a></p>
          </div>`
      : html`<section class="grid">${v.recipes.map((r) => card(r, v.here))}</section>`}
  `;
  return layout("Recipes", body);
}

export function viewPage(r: Recipe): Html {
  const ingredients = splitLines(r.ingredients);
  const steps = splitLines(r.steps);
  const body = html`
    <article class="recipe">
      <div class="card-top">
        <h1>${r.title}</h1>
        ${favoriteButton(r, `/recipes/${r.id}`)}
      </div>
      <p class="muted">${r.description}</p>
      <p class="muted small">${meta(r)}</p>
      <p class="tags">${tagLinks(r.tags)}</p>

      <div class="columns">
        <section>
          <h2>Ingredients</h2>
          ${ingredients.length
            ? html`<ul>
                ${ingredients.map((line) => html`<li>${line}</li>`)}
              </ul>`
            : html`<p class="muted">None listed.</p>`}
        </section>
        <section>
          <h2>Steps</h2>
          ${steps.length
            ? html`<ol>
                ${steps.map((line) => html`<li>${line}</li>`)}
              </ol>`
            : html`<p class="muted">None listed.</p>`}
        </section>
      </div>

      <div class="actions">
        <a class="button" href="/recipes/${r.id}/edit">Edit</a>
        <form
          class="inline"
          method="post"
          action="/recipes/${r.id}/delete"
          onsubmit="return confirm('Delete this recipe for good?')"
        >
          <button class="danger" type="submit">Delete</button>
        </form>
        <a href="/">Back to all recipes</a>
      </div>
    </article>
  `;
  return layout(r.title, body);
}

export function formPage(opts: {
  heading: string;
  action: string;
  values: FormValues;
  error?: string;
}): Html {
  const { values: v } = opts;
  const body = html`
    <h1>${opts.heading}</h1>
    ${opts.error ? html`<p class="error" role="alert">${opts.error}</p>` : ""}
    <form class="recipe-form" method="post" action="${opts.action}">
      <label>Title
        <input name="title" value="${v.title}" required maxlength="200" />
      </label>
      <label>Description
        <input name="description" value="${v.description}" />
      </label>
      <label>Ingredients <span class="muted small">(one per line)</span>
        <textarea name="ingredients" rows="8">${v.ingredients}</textarea>
      </label>
      <label>Steps <span class="muted small">(one per line)</span>
        <textarea name="steps" rows="8">${v.steps}</textarea>
      </label>
      <label>Tags <span class="muted small">(separate with commas)</span>
        <input name="tags" value="${v.tags}" />
      </label>
      <div class="row">
        <label>Prep minutes
          <input name="prep_minutes" inputmode="numeric" value="${v.prep_minutes}" />
        </label>
        <label>Servings
          <input name="servings" inputmode="numeric" value="${v.servings}" />
        </label>
      </div>
      <div class="actions">
        <button type="submit">Save recipe</button>
        <a href="/">Cancel</a>
      </div>
    </form>
  `;
  return layout(opts.heading, body);
}

export function notFoundPage(): Html {
  return layout(
    "Not found",
    html`<div class="empty">
      <h1>Not found</h1>
      <p>That page or recipe does not exist.</p>
      <p><a class="button" href="/">Back to all recipes</a></p>
    </div>`,
  );
}
