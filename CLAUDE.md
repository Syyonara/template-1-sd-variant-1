# Building a dealer brand site in this repository

This repo is a **BuzzNerd dealer brand site**. It is also the template every dealer
site is generated from, so the instructions below apply whether you are working in
the template itself or in a repo generated from it.

The site's content is **JSON, not HTML**. A renderer turns that JSON into static
HTML at build time, and the same renderer draws the editing canvas in the BuzzNerd
dashboard. That is the whole reason for the JSON: a page authored here can be
opened and edited visually afterwards. Write HTML instead and you get a page that
builds but cannot be edited, which defeats the point of building it here.

**The single rule that matters: `npm run validate` must pass before you push.**
It runs the renderer's own validators over every file you wrote and reports the
file, the path inside it, and the fix. A repo that fails it will either be refused
by the dashboard or open with holes in it.

```bash
npm install          # nothing to install — zero dependencies. Node 20+.
npm run validate     # every site/ file against the renderer's rules
npm test             # the renderer's own specs
npm run build        # site/ -> dist/, the real static output
npm run check        # all three, in order
```

---

## 1. What you may and may not write

| Path | |
|---|---|
| `site/**` | **Yours.** All content: pages, templates, components, menus, forms, buttons, tokens, blog. |
| `public/**` | **Yours.** Static assets — images, logos, fonts. |
| `dealer.config.json` | **Yours**, except the identity fields the platform fills in (below). |
| `renderer/**`, `scripts/**`, `ai/**`, `vercel.json`, `dealer.config.schema.json` | **Platform-owned. Do not edit.** The platform overwrites these when it syncs a repo forward, so an edit here is lost — and until it is lost, this dealer is running a renderer nobody else is. |

If something you need cannot be expressed in `site/`, that is a platform gap worth
reporting, not a reason to edit `renderer/`.

In `dealer.config.json`, leave `channelToken`, `domain`, `url` and
`storefrontOrigin` as their `REPLACE_…` placeholders. The platform writes them
when the repo is connected to a dealer's channel. Everything else — `name`,
`business`, `seo`, `logo`, `favicon` — is yours and should be filled in properly.

---

## 2. The document model

A page, a template and a component are all the same shape: a tree of nodes.

```json
{
  "version": 2,
  "nodes": [
    { "id": "hero", "type": "section", "props": { "background": "ink", "paddingY": 8 }, "children": [
      { "id": "hero-row", "type": "row", "props": { "gap": 6 }, "children": [
        { "id": "hero-copy", "type": "column", "props": { "span": 7 }, "children": [
          { "id": "hero-h", "type": "heading", "props": { "text": "Trucks that work as hard as you do", "headingLevel": 1 } },
          { "id": "hero-cta", "type": "buttons", "props": { "items": [{ "ctaId": "browse-inventory" }] } }
        ]},
        { "id": "hero-media", "type": "column", "props": { "span": 5 }, "children": [
          { "id": "hero-img", "type": "image", "props": { "image": { "src": "/hero.jpg", "alt": "A truck at dusk" } } }
        ]}
      ]}
    ]}
  ]
}
```

Four layout types, and everything else is a leaf:

| Type | Holds | Notes |
|---|---|---|
| `section` | rows, widgets | A full-bleed band. `width`, `background`, `paddingY`, `minHeight`. |
| `row` | columns **only** | A 12-column grid. `gap`, `stackOn`. |
| `column` | rows (nesting), widgets | Declares `span` 1–12. Spans in one row should total 12. |
| `contentArea` | nothing | Templates only. Marks where a page's content is injected. |
| any widget | **nothing** | A widget with `children` is rejected. |

Rules the validator enforces, so learn them now rather than from the error:

- **`id` is required, short, and unique across the document.** Never renumber ids
  in a file that already exists — the editor treats a changed id as delete + add
  and the dealer loses that node's history.
- **`props` must validate against the type's schema.** Unknown props are dropped
  with a warning, never guessed at.
- **A widget cannot hold children.** "A widget with two halves" is a row with two
  columns.
- Every node may *also* carry `anchor` (becomes a real HTML `id`), `scope`,
  `behaviour` / `part` / `behaviourOptions` (§5) and `repeat` (components only).

The authoritative list of every block, every prop and every allowed value is
**`renderer/block-schemas.json`** (regenerate with `npm run schemas`). Read it
rather than guessing. Today's catalogue:

- **basic** — `heading` `text` `image` `buttons` `list` `spacer` `divider` `customHtml`
- **navigation** — `logo` `menu`
- **forms** — `form`
- **dealer data** — `widget` (live inventory, locations, hours, phones, FAQ, staff)
- **prebuilt sections** — `hero` `splitHero` `iconGrid` `categoryGrid` `statBand` `serviceGrid` `testimonials` `logoStrip` `postsList` `locationsMap` `footer`

**Avoid `customHtml`.** It renders, but it is opaque to the editor, cannot be
restyled from the design system, and fails analytics tagging. Reach for it only
when the alternative is not shipping the section at all, and say so in your
summary. A repeating shape that no block covers should be a custom widget (§6).

---

## 3. Where each thing lives

```
site/pages.json              The page manifest — the dashboard's page list
site/pages/<dir>/page.json   One page's node tree
site/templates/<id>.json     Header/footer/layout, wrapped around pages by display conditions
site/sections/<id>.json      Designed components: a tree reused on many pages
site/widgets/<id>.json       Custom widgets: markup + props, for repeating shapes
site/menus.json              Named menus (label + destination trees)
site/buttons.json            The CTA library — every button, once
site/forms/<id>.json         Form definitions, including where leads route
site/tokens.json             The design system: colour, type, spacing, radius, fonts
site/blog/settings.json      Blog on/off, base path, title
site/blog/posts/<slug>.json  One post
site/custom-code.json        Site-wide css/js escape hatch — last resort
```

### Templates and display conditions

A template is a full layout — header, a `contentArea`, footer — and **display
conditions decide which pages it wraps**. A template with no matching condition
is not an error: it builds, it validates, and it appears on nothing. That is the
most expensive mistake available here, so `npm run validate` now refuses an
unknown condition type and warns when no template covers the site.

```json
{ "version": 2, "id": "default", "name": "Site template",
  "conditions": [{ "type": "entireSite", "ref": null }],
  "nodes": [ /* header … */ { "id": "content", "type": "contentArea", "props": {} } /* … footer */ ] }
```

Condition types, least to most specific: `entireSite`, `allPages`, `allPosts`,
`blog`, `inventory`, `pageGroup` (`ref` = a group name), `page` / `post`
(`ref` = a slug). The most specific match wins, so a homepage with its own
treatment is a second template with `{ "type": "page", "ref": "home" }` — not a
copy of the default with one section changed.

Every site needs one `entireSite` or `allPages` template, or pages fall through
to no chrome at all. And a template needs **exactly one** `contentArea`: none
means the page has nowhere to go, two means there is no answer to which.

Two cross-file rules the validator checks and nothing else will:

- Every entry in `site/pages.json` needs a matching `site/pages/<dir>/page.json`,
  and `out` must agree with `path` (`/financing` → `financing/index.html`).
- Every id a node references must exist: `formId`, `ctaId`, `sectionId`, `menuId`,
  and a menu item's `ref` pointing at a page slug.

---

## 4. Use the libraries, not literals

This is the difference between a site a dealer can run and a pretty dead end.

| Instead of | Do this | Why |
|---|---|---|
| A hand-built `<form>` or a form's fields inline | `{"type":"form","props":{"formId":"request-info"}}` | A form owns its validation, consent text and **where the lead is routed**. A hand-built one sends leads nowhere and nobody notices for a month. |
| A button with an inline label and url | `{"ctaId":"browse-inventory"}` from `site/buttons.json` | One place to change the label, and consistent conversion tracking. |
| A typed-out list of nav links | `{"type":"menu","props":{"menuId":"main"}}` | Edited in one place, used in many. |
| A typed-out list of locations, hours, phone numbers, or inventory | `{"type":"widget","props":{"widget":"locations-map"}}` etc. | Live platform data. A hardcoded address list is wrong the day a location moves. |
| A hardcoded hex, font size or spacing value | A token in `site/tokens.json` | One edit restyles the whole site. Hardcoded values are what make a site un-rebrandable. |
| Hand-maintained "latest news" cards | `postsList` | Resolves real posts at build time; cards never go stale. |

If a library item you need does not exist, **create it** (a button in
`buttons.json`, a menu in `menus.json`, a form in `site/forms/`) and then
reference it. Do not inline it because the library is empty.

---

## 4a. Navigation: menus, dropdowns and mega panels

Navigation is the part most often got wrong, so it gets its own section.

A menu is **structure only** — a named tree of destinations in `site/menus.json`.
It has no idea where it appears or what it looks like; the `menu` block that
places it owns the presentation. That separation is what lets one menu be a
header bar, a footer column and a mega panel on the same site without being
copied three times.

```json
{
  "version": 3,
  "menus": [
    {
      "id": "main",
      "name": "Main navigation",
      "items": [
        { "id": "inventory", "label": "Inventory", "type": "inventory", "ref": null },
        { "id": "service", "label": "Service", "type": "page", "ref": "service" },
        { "id": "call", "label": "(801) 555-0100", "type": "url", "url": "tel:+18015550100" }
      ]
    }
  ]
}
```

**Item types** — the type decides how the destination resolves at build time:

| `type` | Uses | Resolves to |
|---|---|---|
| `page` | `ref` = a page **slug** | That page's current path. Rename the page and the link follows. |
| `post` | `ref` = a post slug | The post under the blog's base path. |
| `inventory` | `ref` = a storefront route (below) | That route under the storefront prefix (`/store`). |
| `url` | `url` | Verbatim — external links, `tel:`, `mailto:`, `#anchor`. |
| `label` | — | **Not a link.** A heading inside a panel. |

Never write a page's address as a `url` item. `page` + slug survives the page
being moved; a typed path does not, and nothing warns you when it breaks.

### Linking into the live storefront

The storefront is a separate app proxied in under one prefix, and **`ref` names
the route inside it**. Leaving `ref` null gives you bare `/store`, which is the
storefront's own landing page — almost never what a nav item means. Say which
route you want:

| `ref` | Resolves to | |
|---|---|---|
| `"inventory"` | `/store/inventory` | **The listings page.** What "Inventory" / "All inventory" means. |
| `"parts"` | `/store/parts` | The parts catalogue. |
| `"search"` | `/store/search` | Storefront search. |
| `"account"` | `/store/account` | The buyer's account. |
| `"sign-in"` | `/store/sign-in` | Sign in. |
| `"checkout"` | `/store/checkout` | Cart / checkout. |
| `null` | `/store` | The storefront landing page. Rarely what you want. |

A `ref` may carry a query string, which is how a pre-filtered view is linked:
`"inventory?condition=new"` → `/store/inventory?condition=new`. "New trucks",
"Used trucks" and "Lease & rental" are all this — one listings page with a facet
applied, not three pages.

**Never write these as `url` items.** `{"type":"url","url":"/store/inventory"}`
hardcodes the prefix, and the prefix is configuration: the day it changes, every
one of those links 404s and nothing warns you. `type: "inventory"` resolves the
prefix at build time from `dealer.config.json`.

**Depth is 3, and the third level is what makes a mega menu.** Nesting is
`children` on any item.

**Placing a menu** — `{"type":"menu","props":{"menuId":"main","layout":"horizontal"}}`:

| Prop | |
|---|---|
| `menuId` | Which menu. Required. |
| `layout` | `horizontal` (a bar, submenus as dropdown cards), `vertical` (stacked — footers), `mega` (see below). |
| `collapseOnMobile` | Collapse behind a hamburger. Set it on the header's menu. |
| `align` | `start` / `center` / `end` within its column. |
| `depth` | How many levels to draw. `1` hides submenus. |

### Mega menus

A mega panel is not a different data model — it is a **three-level menu** drawn
with `layout: "mega"`:

```
Sales                     level 1 — the trigger in the bar
├── Showroom              level 2 — a column heading (type "label", so not a link)
│   ├── Volvo             level 3 — the links in that column
│   └── Mack
└── Category
    ├── Day Cab
    └── Sleeper
```

```json
{ "id": "nav", "type": "menu", "props": { "menuId": "main", "layout": "mega", "collapseOnMobile": true } }
```

Level two becomes the columns, level three the links, and the panel spans the
viewport. Below 1100px it becomes an ordinary stacked disclosure. Nothing is
scripted, and the dealer can edit every label on the Menus screen afterwards.

Two things to get right:

- Column headings are `type: "label"`. A heading that is also a link is allowed
  (`page`/`url`), but a `label` is the honest choice for a heading that goes
  nowhere — `#` links are a dead end for keyboard and screen-reader users.
- A mega panel is `position: absolute` and viewport-wide. **No ancestor may clip
  overflow**, so do not put `overflow: hidden` on the header section.

### What a menu is not for

A **utility bar** — phone number on the left, a few links on the right — is a
section with a row and two columns: a `text` or `buttons` block on one side, a
`menu` on the other. Do not try to express two alignment groups as one menu.

A **drilldown** (region → state → city) is a `filter` behaviour, not a menu. See
§5: the middle column's nodes carry `part: "item control"` — filtered by the
level above, filtering the level below.

---

## 5. Interaction without JavaScript

Carousels, filters, dropdowns, drawers and rotators are **declared, not scripted**.
Put `behaviour` on the container, `part` on each moving piece, and the platform's
own accessible implementation binds at runtime:

```json
{ "id": "rail", "type": "section", "props": { "behaviour": "carousel",
    "behaviourOptions": "{\"perMove\":1}" }, "children": [ … ] }
```

Available: `carousel` `filter` `dropdown` `drawer` `rotator` `scrollstate`
`dependentselect` `mapsync`. Each behaviour's expected `part` names are in
`renderer/behaviours.mjs` — a mismarked part fails silently, so check them.

**A node may play several parts at once**, space-separated. That is how a
chained drilldown works — Crossroad's Region → State → City panel is one
`filter` whose state buttons are `part: "item control"`: hidden unless their
region is chosen, and choosing one filters the cities below. Items carry the
facet they belong to as `data-` attributes; controls carry `data-bz-facet` and
`data-bz-value`. Multi-facet filtering with a live count is built in.

This is the *only* supported route to interaction. Custom widgets cannot contain
`<script>`, and per-page scripts are a last resort.

---

## 6. Custom widgets — for repeating shapes only

When a design needs markup no block expresses **and it repeats over data**, write
`site/widgets/<id>.json`: an id, a label, typed `props`, an `html` template in a
tiny Mustache subset (`{{key}}`, `{{#if}}`, `{{#each}}`, `{{img key}}`,
`{{link key}}`), and scoped `css`.

Constraints, all enforced: it is a **leaf** (no `data-bz-slot`, no children), no
`<script>`, no `<iframe>`, no `<form>`, no inline handlers. Style it with
`var(--accent)`, `var(--space-4)` and the rest — a hardcoded hex breaks the
dealer's design system.

For a one-off piece of design that does not repeat, build it out of
section/row/column and real blocks instead. It stays editable that way; a widget
does not.

---

## 7. Turning a design handoff into this repo

The workflow this repo is built for. Work in this order — each step makes the next
one cheaper.

1. **Read the handoff's design system first.** Map its tokens into
   `site/tokens.json` before you build anything, so every section you write is
   already on-brand. A worked example, from the `sd-international-design-system`
   handoffs:

   | Handoff | `site/tokens.json` |
   |---|---|
   | `--color-accent: #E8531F` | `colors.accent` |
   | `--syyo-orange-700: #A23A16` | `colors.accentDark` |
   | `--color-ink: #1A1714` | `colors.ink` |
   | `--color-paper: #F2EEE6` | `colors.paper` |
   | `--color-card: #FFFFFF` | `colors.card` |
   | `--color-line: #E1DACB` | `colors.line` |
   | `--color-muted: #6B6354` | `colors.muted` |
   | `--text-lg: 22px` … | `type.h2` … (six steps, so compress the scale) |
   | `--radius-md: 10px` | `radius.card` |

   Brand fonts: put the `.woff2` files in `public/fonts/` and list them in
   `tokens.fonts.files`; the build emits `@font-face` and preloads them. Do not
   assume Google Fonts has the licensed face.

2. **Ignore the prototype's scaffolding.** A `.dc.html` handoff runs inside a
   private preview runtime. `support.js`, `_ds_bundle.js`, `<x-dc>`, `<sc-for>`,
   `<sc-if>`, `style-hover` attributes and `{{ }}` holes have no equivalent here
   and must not be carried over. Translate the *design*, not the prototype.

3. **Build the chrome once, as a template.** Header, utility nav and footer go in
   `site/templates/default.json` with a `contentArea` between them — not into
   every page. Nav comes from `site/menus.json`.

4. **Then the page**, section by section, in the handoff's order. For each
   section: reach for a prebuilt block, then a composition of
   section/row/column + basic blocks, then a custom widget, and only then
   `customHtml`.

5. **Anything shared across pages becomes a component** in `site/sections/` and
   is placed with `sharedSection` — the utility bar and newsletter band in
   particular.

6. **Map data-shaped sections to live widgets.** Featured inventory, locations,
   hours and staff should be `widget` nodes, not the handoff's hardcoded arrays.
   This is where the built site becomes *better* than the prototype: those
   sections stay correct forever.

7. **Note what you dropped.** Prototypes are unfinished — dead anchors, unwired
   newsletters, placeholder photography, effects the renderer cannot express
   (3D transforms, cross-frame maps). List them in your summary rather than
   approximating them silently.

8. **`npm run check`.** Then push.

---

## 8. Handing the repo to the dashboard

A repo built here is opened in the BuzzNerd dashboard like this:

1. Push it to GitHub, under the **same owner** as the platform's other dealer
   sites (the platform addresses every repo under one configured owner).
2. Make sure `npm run validate` passes and `renderer/`, `scripts/build.mjs`,
   `dealer.config.json` and `vercel.json` are present — the dashboard refuses to
   connect a repo missing any of them.
3. In the dashboard, on the dealer's channel: **Website → Connect an existing
   repository**, and paste the name (`name`, `owner/name` or the GitHub URL).
4. The platform then writes the channel's identity into `dealer.config.json`,
   creates the `draft` branch the editor saves to, and reports any renderer
   version drift. Publishing brings platform files up to date.

After that the repo is a normal dealer site: every page, template and component
you wrote is editable on the canvas, and every save is a commit on `draft`.

**Branches.** `draft` is what the editor writes and previews; `main` is
production, fast-forwarded to `draft` on publish. Build your work on the default
branch and let the platform create `draft` on connect.
