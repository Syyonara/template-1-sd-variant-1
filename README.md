# Dealer Site Template — v3

The GitHub template every dealer's brand site is generated from. Framework-free: no
Astro, no Tailwind build, no dependencies. Pages are composed from a block library in
the dashboard's Website editor, stored here as JSON, and rendered to static HTML on
Vercel. `/store/*` is rewritten to the Remix storefront.

```bash
npm run validate   # every site/ file against the renderer's rules  <- run this first
npm run build      # node scripts/build.mjs      -> dist/   (zero dependencies)
npm test           # node --test renderer/…      the renderer's own specs
npm run check      # validate + test + build, in that order
npm run schemas    # regenerate renderer/block-schemas.json
```

**Authoring this repo by hand or with an agent?** Read `CLAUDE.md` — the document
model, the block catalogue, what is writable, and how a finished repo is connected
to a dealer's channel in the dashboard. `npm run validate` is the gate: it runs the
renderer's own validators over every file and reports the file, the path inside it
and the fix, including the cross-file references (a `formId` with no form, a menu
item pointing at a deleted page) that no single-file check can see.

## Layout

```
dealer.config.json      Identity, business facts, SEO defaults, analytics loader
vercel.json             /store rewrite + partials cache + security headers  [platform-owned]
renderer/               THE RENDERER — the single source of truth for site output  [platform-owned]
  index.mjs               Public API
  tokens.mjs              tokens.json -> CSS custom properties (+ scoped brand overrides)
  blocks.mjs              The block library: renderer + JSON Schema per block
  page.mjs                Block list -> HTML
  ops.mjs                 Patch operations (the AI's reply shape) applied to a page
  validate.mjs            Page JSON validated against the block schemas
  forms.mjs               Form definitions -> accessible markup
  widgets.mjs             Widget placeholders + hydration hooks
  menus.mjs shell.mjs templates.mjs
  blocks.css              Public component styles, token-driven
  client/widgets.js       Hydration + form logic + submit (zero-dep, ships to dist/)
  block-schemas.json      Generated catalogue, consumed by the plugin and dashboard
ai/                     THE AI CONTRACT                                    [platform-owned]
  SKILL.md                The operative contract for block pages
  README.md               Which contract applies to which page format
  build-instructions.md   Legacy freeform-HTML contract (body.html pages)
  design-system.md seo.md aio.md global-elements.md
site/
  tokens.json           DESIGN SYSTEM — colors, status, type, spacing, radius, fonts
  tokens/<scope>.json   Per-brand scoped overrides (may only set existing keys)
  menus.json            Named menus + which menu each theme location shows
  buttons.json          CTA library — label, destination, style, tagging intent
  forms/<id>.json       Form library — fields, logic, consent, notification routing
  templates/<slot>--<name>.json   Header and footer templates, as block lists
  assignments.json      Which template each slot resolves to, per display condition
  pages.json            Page manifest: path, status, seo, per-page template overrides
  reset.css             Minimal global reset
  chrome/               header.html, footer.html, chrome.css, chrome.js  [shared]
  pages/<dir>/          page.json (blocks) — or body.html + style.css (legacy)
scripts/build.mjs       Loads JSON, calls the renderer, writes files      [platform-owned]
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

---

## Changes from v2 (3.0.0) — the block model

| # | Change | Reason |
| --- | --- | --- |
| 1 | `renderer/` added; `build.mjs` reduced to load-JSON → call-renderer → write-files | The dashboard compiled tokens with its own copy of `buildTokensCss`, whose comment said it "mirrors build.mjs exactly". Two copies of a compilation rule is a drift bug with a live dealer site as the blast radius. |
| 2 | A page is `site/pages/<dir>/page.json` — a block list | While a page body was an opaque HTML blob, template attachment, token propagation and reliable analytics tagging were all impossible. `body.html` is still read when there is no `page.json`, so existing repos build untouched. |
| 3 | 21 blocks with JSON Schemas, exported to `renderer/block-schemas.json` | One contract for three consumers: the AI generates against it, the editor builds its inspector from it, the save path validates against it. |
| 4 | Tagging is structural — blocks emit `data-bz-el` / `data-bz-intent` themselves | Browser-tag certification becomes a one-time platform exercise instead of a per-dealer fix-up repeated every time the AI touches a page. `customHtml` is flagged as the one exception, and the build warns on pages containing it. |
| 5 | `site/buttons.json` and `site/forms/<id>.json` — CTA and form libraries | A page references a CTA or a form by id, so its destination, styling, tagging, validation, consent and lead routing live in one place. A form built inline in page markup routes its leads nowhere. |
| 6 | `widget` block + `renderer/client/widgets.js` | Locations, hours, staff, phone numbers and live inventory are platform data. The dashboard commits a snapshot so the facts are in the served HTML; the client refreshes them through the same-origin `/store` proxy. The build still needs no credentials. |
| 7 | `site/templates/` + `site/assignments.json` + `resolveTemplates` | There was no way to attach a header or footer to a page. Resolution reports the winning rule, so "why is this header here" is answerable without reading four files. |
| 8 | `partials/manifest.json` carries one entry per chrome combination + a route table | Once chrome is conditional, one `header.html` is insufficient: `/store` and a brand page can resolve to different headers. |
| 9 | `site/tokens/<scope>.json` — scoped brand overrides | The Brand Page Template gives each OEM "its own logo, assets and design system", which one flat `tokens.json` cannot express. A scope restyles within the same cascade and may only set keys that already exist. |
| 10 | `ai/SKILL.md` — the block-era contract, synced from the plugin | The five `ai/*.md` files were copied into each dealer repo at generation and never updated, so the live contract (`services/ai/contract.ts`) and the repo's copy drifted from day one. |

### The parity rule, restated

The build never re-renders editor output *differently* — it renders it with the same
code. `scripts/build.mjs` and the dashboard canvas both import `renderer/`, so what the
dealer sees while editing is what Vercel serves. That property only holds while there is
one copy of the renderer; do not vendor a second one.

### Propagating renderer changes to existing dealers

A dealer repo is generated from this template **once**. Nothing about GitHub template
generation updates it afterwards, so a renderer fix would otherwise reach new dealers
only. The plugin's `SiteRepoService.syncPlatformFiles()` pushes `renderer/`,
`scripts/`, `ai/` and `vercel.json` from this template into a dealer repo, deliberately
bypassing the editor's write allowlist the same way provisioning does. Platform-owned
paths are exactly the paths that sync; `site/`, `public/` and `dealer.config.json` are
never touched by it.


---

## Changes in the renderer's 3.0.0

| # | Change | Reason |
| --- | --- | --- |
| 1 | Menus follow the WordPress model: any number of named menus, and a *location* (primary, mobile, footer, legal, utility) that a menu is assigned to | The four hardcoded location-shaped menus made it impossible to have one "Legal" menu appear in two places, or to swap the site's main menu without retyping every item. A v1 `menus.json` still renders — each old location becomes a menu of the same name assigned to the matching new location. |
| 2 | Menu items point at a page by slug, not by address | Renaming a page's address used to leave a dead link in every menu that referenced it. |
| 3 | Two site parts, `header` and `footer` — `utilityNav` and `siteFooter` are gone | They were slots, which baked the layout into the slot list: there was no way to put a utility bar *below* the nav. A utility bar is now a `bar` block inside the header template, where it can go anywhere. |
| 4 | New chrome blocks: `bar`, `logo`, `menu`; starter `header--default` and `footer--default` templates | A header is a template you edit in the same canvas as a page. Hand-written `site/chrome/*.html` still renders for repos that have no template yet. |
| 5 | `DEFAULT_TOKENS` and `withDefaults()` | A repo with no `site/tokens.json` used to leave the design system screen empty and unusable. There is always a full token set to edit now, and saving writes the file. A partial token file is merged rather than compiled with holes in it. |
