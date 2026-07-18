# Dealer Site Template (A) — freeform, static, AI-built

The GitHub template every dealer's brand site is generated from. Framework-free:
no Astro, no Tailwind build. The site is authored by the AI in the "Website" editor
(GrapesJS engine), exported as final HTML/CSS/JS, committed here, and served static on
Vercel. `/inventory/*` is rewritten to the Remix inventory micro-site.


## Layout

```
dealer.config.json     Source of truth for brand token VALUES + business facts + channel token
vercel.json            /inventory rewrite (channel token baked in) + partials cache + headers
ai/                    THE AI CONTRACT — how the AI builds any design within the rules
  build-instructions.md  Master build contract (provider-neutral: Claude or OpenAI)
  design-system.md     Fixed token keys, editable values, usage rules
  global-elements.md   Header/top-nav/footer as shared chrome + the /inventory handoff
  seo.md               Per-page SEO floor + structured data
  aio.md               AI/answer-engine optimisation (llms.txt, schema, semantic facts)
site/                  Source doc + exported artifacts
  project.json         GrapesJS getProjectData() — SOURCE OF TRUTH
  reset.css            Minimal global reset
  chrome/              header.html, footer.html, chrome.css (shared; exported for Remix too)
  pages/<slug>/        body.html + style.css (freeform page bodies = getHtml/getCss export)
  pages.json           Page manifest (title, description, path, out) — drives assembly, sitemap, llms.txt
scripts/build.mjs      Zero-dep assembler (no GrapesJS re-render, no vercel.json rewrite)
public/                favicon, og image, static assets (media proper lives in R2)
```

## Build

```bash
npm run build      # node scripts/build.mjs -> dist/   (no dependencies)
```

Produces `dist/`: each page wrapped in `<head>` + shared chrome, `styles/*.css`,
`partials/*` (chrome + tokens for the Remix micro-site), `sitemap.xml`, `robots.txt`,
`llms.txt`, and `public/*`. Vercel serves `dist/` (`framework: null`).

## The parity rule

The build never re-renders GrapesJS output. Page bodies and chrome are injected
verbatim from what the editor exported, so the built site matches the editor canvas.
`tokens.css` is derived from `dealer.config.json` values (materialised from the DB at
publish).

## Per-dealer generation (automated)

The dashboard creates `dealer-<token>` from this template via the GitHub API, replaces
`REPLACE_CHANNEL_TOKEN` in `dealer.config.json` and `vercel.json`, seeds
`site/project.json`, and creates the Vercel project. Publishing = export → commit →
Vercel build → preview URL → promote to production.
