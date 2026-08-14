# Dealer Site Template (A) — freeform, static, AI-built

The GitHub template every dealer's brand site is generated from. Framework-free:
no Astro, no Tailwind build. The site is authored by the AI in the "Website" editor
(GrapesJS engine), exported as final HTML/CSS/JS, committed here, and served static on
Vercel. `/inventory/*` is rewritten to the Remix inventory micro-site.

**Source of truth = plain files.** The canonical, committed representation of a site is
the set of plain files under `site/` plus `dealer.config.json`. GrapesJS imports these
for editing and exports them back on save; its internal `project.json` is a runtime
detail of the editor and is **not** stored here. Any capable AI model can read/write
these plain files, git diffs stay human-readable, and the build never re-renders them
(the parity rule, below).


## Layout

```
dealer.config.json        Source of truth for brand token VALUES + business facts + channelToken
dealer.config.schema.json JSON Schema validating dealer.config.json
vercel.json               /inventory rewrite (channelToken baked in) + partials cache + headers
ai/                       THE AI CONTRACT — how the AI builds any design within the rules
  build-instructions.md     Master build contract (provider-neutral: any capable model)
  structure.md              WHERE every kind of data is saved + how nav.json works
  design-system.md          Fixed token keys, editable values, usage rules
  global-elements.md        Header/top-nav/footer as shared chrome + the /inventory handoff
  seo.md                    Per-page SEO floor + structured data
  aio.md                    AI/answer-engine optimisation (llms.txt, schema, semantic facts)
site/                     Canonical plain files (the source of truth)
  nav.json                  Top-nav menu [{label, path, locked?}] — Inventory locked to /inventory
  pages.json                Page manifest (slug, title, description, path, out, dir, nav)
  reset.css                 Minimal global reset
  chrome/                   header.html, footer.html, chrome.css (shared; exported for Remix too)
  pages/<slug>/             body.html + style.css (+ optional script.js) — freeform page bodies
  blog/
    post.template.html      One post layout ({{title}} {{date}} {{coverImage}} {{body}})
    posts/<slug>.json       Post records (slug, title, date, description, coverImage, body)
scripts/build.mjs         Zero-dep assembler (no GrapesJS re-render, no vercel.json rewrite)
public/                   favicon, logo, og image, static assets (media proper lives in R2)
```

## Build

```bash
npm run build      # node scripts/build.mjs -> dist/   (no dependencies)
```

Produces `dist/`: each page wrapped in `<head>` + shared chrome, blog posts rendered
through `post.template.html` plus a generated blog index, `styles/*.css`, `partials/*`
(chrome + tokens for the Remix micro-site), `sitemap.xml`, `robots.txt`, `llms.txt`,
and `public/*`. Vercel serves `dist/` (`framework: null`).

## The parity rule

The build never re-renders GrapesJS output. Page bodies and chrome are injected
verbatim from what the editor exported, so the built site matches the editor canvas.
`tokens.css` is derived from `dealer.config.json` values (materialised from the DB at
publish).

## Per-dealer generation (automated)

The dashboard creates `dealer-<channelToken>` from this template via the GitHub API,
replaces `REPLACE_CHANNEL_TOKEN` (and `inventoryOrigin` / `domain`) in
`dealer.config.json` and `vercel.json`, and creates the Vercel project. Editing writes
the plain `site/*` files back and commits them. Publishing = export → commit → Vercel
build → preview URL → promote to production.
