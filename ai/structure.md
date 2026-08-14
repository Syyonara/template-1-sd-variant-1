# Structure — Where Every Kind of Data Is Saved

This is the data-location map. Follow it **verbatim**. The plain files under `site/`
plus `dealer.config.json` are the source of truth; the GrapesJS editor imports and
exports them, and `scripts/build.mjs` assembles them into `dist/` without ever
re-rendering their content (the parity rule).

Never write outside `site/` and `public/`. Never touch `scripts/`, `vercel.json`, or
`ai/` — those are owned by the platform, not by site content.

## New page

Create a folder and register it:

1. `site/pages/<slug>/body.html` — the page body only (what goes inside `<main>`).
   No `<html>`, `<head>`, `<body>`, header, or footer.
2. `site/pages/<slug>/style.css` — page-scoped CSS, token-driven.
3. `site/pages/<slug>/script.js` — **optional**; only if the page needs interactivity.
   Vanilla, dependency-free, progressive.
4. Add an entry to `site/pages.json`:
   `{ "slug", "title", "description", "path", "out", "dir", "nav" }`
   - `path` is the clean public URL (`/financing`).
   - `out` is the output file (`financing/index.html` so the URL is clean).
   - `dir` is the folder name under `site/pages/` (usually equals `slug`).
   - `nav` is a hint only; the actual menu is `nav.json` (below).
5. If the page belongs in the top nav, add it to `site/nav.json`.

## Menu (top nav)

`site/nav.json` is the **single source of truth** for the top navigation:
`[{ "label", "path", "locked"? }]`.

- Entries with `"locked": true` (notably **Inventory → `/inventory`**) must never be
  removed, renamed, or re-pointed.
- The shared header (`site/chrome/header.html`) renders these links. When you change
  the menu, update `nav.json` **and** regenerate the matching links in the shared
  header so they stay in sync.
- Individual blog posts never go in `nav.json`; the **Blog index** (`/blog`) does.

## Chrome (header / footer)

Chrome is shared across every page and defined once:

- Edit `site/chrome/header.html`, `site/chrome/footer.html`, or
  `site/chrome/chrome.css`.
- Never copy header/footer markup into a page body. Editing the shared file
  propagates the change to every page (and to the inventory pages, which the Remix
  micro-site wraps with the published `/partials/*`).

## Tokens (brand look)

- Propose new **VALUES** in `dealer.config.json.brand` (colors, fonts, radius,
  container). Never add new token **keys**, and never scatter raw hex/px through page
  CSS for anything a token covers. See `design-system.md`.

## Blog

- A post is a record: `site/blog/posts/<slug>.json` with
  `{ "slug", "title", "date", "description", "coverImage", "body" }` (`body` is HTML).
- Posts render through `site/blog/post.template.html` at build time
  (`{{title}} {{date}} {{coverImage}} {{body}}` and related placeholders).
- Posts are **never** pages under `site/pages/` and never appear individually in
  `nav.json`. The build generates the `/blog` index automatically from the posts.

## Media

- Upload binaries through the media manager to Cloudflare R2 and reference the
  returned URL. Never commit image/video binaries to the repo, and never inline large
  base64 data URIs.

## Never write here

- `scripts/build.mjs`, `vercel.json`, `dealer.config.schema.json`, and everything
  under `ai/` are platform-owned. Do not create or edit them, and never create content
  under `/inventory/*` (owned by the Remix inventory micro-site).
