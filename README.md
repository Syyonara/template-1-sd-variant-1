# Dealer Site Template — v2

The GitHub template every dealer's brand site is generated from. Framework-free: no
Astro, no Tailwind build, no dependencies. The site is authored in the dashboard's
Website editor, exported as HTML/CSS/JS, committed here, and served static on Vercel.
`/store/*` is rewritten to the Remix storefront.

```bash
npm run build      # node scripts/build.mjs -> dist/   (zero dependencies)
```

## Layout

```
dealer.config.json      Identity, business facts, SEO defaults, analytics loader
vercel.json             /store rewrite + partials cache + security headers  [platform-owned]
ai/                     THE AI CONTRACT — how the AI builds any design within the rules
  build-instructions.md   Master contract (provider-neutral)
  design-system.md        Token keys, editable values, usage rules
  global-elements.md      Header / menus / footer + the /store handoff
  seo.md                  Per-page SEO floor + structured data
  aio.md                  Answer-engine optimisation (llms.txt, schema, semantic facts)
site/
  tokens.json           DESIGN SYSTEM — colors, status, type, spacing, radius, fonts
  menus.json            Four menu locations; injected into the chrome at build
  pages.json            Page manifest: path, status, seo, per-page template overrides
  reset.css             Minimal global reset
  chrome/               header.html, footer.html, chrome.css, chrome.js  [shared]
  pages/<dir>/          body.html + style.css + optional script.js
scripts/build.mjs       Zero-dep assembler                              [platform-owned]
public/                 favicon, og image, static assets (media proper lives in R2)
```

## What the build emits

```
dist/index.html                    each page, wrapped in <head> + shared chrome
dist/styles/{tokens,reset,chrome}.css
dist/scripts/chrome.js             shared chrome behaviour
dist/scripts/pages/<dir>.js        per-page JS, when the page has a script.js
dist/partials/                     chrome bundle for the Remix storefront:
    header.html footer.html chrome.css chrome.js reset.css tokens.css fonts.txt
    manifest.json                  routing + chrome resolution contract
dist/sitemap.xml  robots.txt  llms.txt
```

## Page status

`pages.json` entries carry a `status`:

| status | emitted | indexed | in sitemap / llms.txt |
| --- | --- | --- | --- |
| `published` | yes | yes | yes |
| `draft` | yes | no (`noindex,nofollow`) | no |
| `archived` | no | — | — |

Drafts are still built so preview deployments can show them.

## The parity rule

The build never re-renders editor output. Page bodies and chrome are injected verbatim
from what the editor exported, so the built site matches the editor canvas. `tokens.css`
is derived from `site/tokens.json`; the dashboard must compile it from the same file
using the same rules, or preview and production will drift.

## Per-dealer generation

The dashboard creates `dealer-<channelToken>` from this template via the GitHub API,
replaces `REPLACE_CHANNEL_TOKEN` and `REPLACE_STOREFRONT_ORIGIN` in
`dealer.config.json` and `vercel.json`, and creates the Vercel project. Publishing =
export → commit to `draft` → Vercel preview → fast-forward `main` → production.

---

## Changes from v1 (and why)

| # | Change | Reason |
| --- | --- | --- |
| 1 | Storefront prefix is `/store` everywhere — `vercel.json`, `menus.json`, chrome, `ai/*.md` | v1 had `/inventory` in the template and `ai/*.md` while `storefront-rewrites.ts` wrote `/store` and deleted `/inventory` rules as stale. Two sources of truth, one live prefix. |
| 2 | `site/menus.json` added; nav injected via `<!-- menu:<location> -->` markers | `site/nav.json` was read by `site-repo.service.ts`, `siteModel.ts` and `contract.ts` but did not exist in the template. Nav was hardcoded inside `header.html`, so a menu change meant editing chrome markup. |
| 3 | Per-page `script.js` is now emitted and loaded | `pagePaths()` wrote it and `WebsitePage.save()` committed it, but `build.mjs` never read it. Page JS was silently discarded. |
| 4 | `site/project.json` deleted | Its own `__note` declared it the source of truth. Nothing read it. |
| 5 | Design system extracted to `site/tokens.json`; spacing / type / radius now dealer-editable | v1 hardcoded everything except eight brand values inside `build.mjs`, so the Design System screen had nothing to edit. |
| 6 | `dealer.config.json` uses `storefrontOrigin` only | v1 declared `storefrontOrigin` but `SiteRepoService.ensureRepo` wrote `inventoryOrigin`, leaving both keys with one unused. **Requires a one-line plugin change — see below.** |
| 7 | `/partials/` now also ships `reset.css` and `chrome.js` | Body typography and the mobile nav live there. Without them the storefront rendered unstyled chrome with a dead menu button. |
| 8 | `/partials/manifest.json` added | Route → chrome resolution contract for Remix. One combination today; the shape supports per-route templates without a storefront change. |
| 9 | `pages.json` gains `status`, `seo`, `templates` | Matches the Pages screen (Draft / Published / Archived, SEO column) and reserves the per-page template override slot. |
| 10 | Tagging attributes (`data-bz-el`, `data-bz-intent`, `data-bz-menu-item`, `data-bz-region`) required on CTAs, phone links and forms | Shift Digital browser tagging needs stable hooks on exactly the elements the AI rewrites most often. |
| 11 | Optional analytics loader tag driven by `dealer.config.json.analytics` | One versioned remote script, so fleet-wide analytics changes are not a commit in every dealer repo. |
| 12 | `site/blog/` added — `settings.json` + `posts/*.json`, rendered to `/blog` and `/blog/<slug>` | `siteModel.ts` parses `site/blog/posts/*.json` and the nav has `/storefront/posts` gated on `EditPosts`, but the template never created the directory. Posts had nowhere to write. |

### Plugin changes this template requires

1. `SiteRepoService.ensureRepo` — write `config.storefrontOrigin`, not
   `config.inventoryOrigin`, and replace `REPLACE_STOREFRONT_ORIGIN` in `vercel.json`.
2. `SiteRepoService.loadBundle` — parse `site/menus.json` and `site/tokens.json` into
   the bundle; drop the `site/nav.json` lookup.
3. `services/ai/contract.ts` — bump `CONTRACT_VERSION` to `2.0.0` and mirror
   `ai/build-instructions.md` v2 (prefix, tokens, menus, tagging attributes).
4. `services/ai/output.ts` — `sanitizeAiResult` must preserve `data-bz-*` attributes.
   It strips `on*` handlers and `<script>` today, which is correct and unchanged.
5. Dashboard `lib/website/tokens.ts` — compile from `site/tokens.json` instead of
   `dealer.config.json.brand`, mirroring `buildTokensCss` in `scripts/build.mjs`.
