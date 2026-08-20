---
name: dealer-site
description: Build or edit a BuzzNerd dealer brand site in this repository — turning a design handoff into pages, templates and components as validated JSON node trees, so the result opens in the BuzzNerd dashboard's visual editor. Use when asked to build a dealer site, import or implement a design handoff (.dc.html, Figma export, screenshots), add or edit a page, section, template, component, menu, form or the design system in this repo, or when a change needs to survive being edited in the dashboard afterwards.
---

# Building a dealer site here

`CLAUDE.md` in the repo root is the contract: the document model, the block
catalogue, what is writable, and the library rules. Read it before writing files.
This skill is the order of operations and the checks.

## The loop

```bash
npm run validate    # after every few files, not once at the end
npm run build       # proves the real static output renders
npm run check       # validate + test + build, before you push
```

`npm run validate` runs the renderer's own validators over everything in `site/`
and names the file, the path inside it, and the fix. It also checks the
cross-file references no single-file check can see — a `formId` with no form, a
menu item pointing at a deleted page, a `page.json` missing for a listed page.
**A repo that fails it will be refused by the dashboard or open with holes.**

Run it early. A structural mistake repeated across twelve sections is twelve
fixes; caught on the second section it is one.

## Order of work for a handoff

1. **Design system first** — map the handoff's tokens into `site/tokens.json`,
   fonts into `public/fonts/` + `tokens.fonts.files`. Everything you build after
   this is automatically on-brand; everything built before it needs revisiting.
2. **Libraries next** — `site/buttons.json`, `site/menus.json`, `site/forms/`.
   Sections reference these by id, so they have to exist first.
3. **Chrome as a template** — header, utility nav, footer in
   `site/templates/default.json`, with one `contentArea` between them.
4. **Pages**, section by section, in the handoff's own order.
5. **Shared bands as components** in `site/sections/`, placed with
   `sharedSection`.
6. **Validate, build, then push.**

## Choosing how to build a section

In this order, and stop at the first that works:

1. A **prebuilt block** — `hero` `splitHero` `iconGrid` `categoryGrid` `statBand`
   `serviceGrid` `testimonials` `logoStrip` `postsList` `locationsMap` `footer`.
2. **section → row → column** plus basic blocks (`heading` `text` `image`
   `buttons` `list`). Most of any design is this.
3. A **`widget`** node, if the section shows dealer data (inventory, locations,
   hours, phones, staff, FAQ). Always prefer this over typed-out data.
4. A **custom widget** in `site/widgets/`, if the shape repeats over a list and
   no block expresses it.
5. **`customHtml`** — only if the alternative is not shipping it. Say so.

Interaction is declared with `behaviour` / `part`, never scripted. See CLAUDE.md §5.

## Navigation, specifically

Both reference handoffs lead with navigation, and it is where most of the
mistakes happen. CLAUDE.md §4a is the full contract; the short version:

- A menu is **data** (`site/menus.json`); the `menu` block is **presentation**.
  Never type a list of links into a page.
- **Mega panels are a three-level menu** with `layout: "mega"` — trigger >
  column heading (`type: "label"`) > links. No new block, no script.
- A **utility bar** with a left and a right group is a row with two columns,
  not one menu.
- Link to pages with `type: "page"` + the **slug**, never a typed path.
- A template's **display conditions** decide which pages it wraps. A template
  with a wrong or missing condition renders on nothing while everything still
  validates and builds — check that one template has `entireSite` or `allPages`.

## Things that will bite you

- **Never reuse or renumber node ids** in a file that already exists. A changed
  id reads as delete-then-add and loses that node's editing history.
- **A widget cannot have children.** Two halves means a row with two columns.
- **`out` must agree with `path`** in `site/pages.json` (`/financing` →
  `financing/index.html`). Nothing but the validator checks this.
- **Leave `REPLACE_…` placeholders alone** in `dealer.config.json` — the platform
  writes the channel token, domain and storefront origin when the repo is
  connected.
- **Do not edit `renderer/`, `scripts/`, `ai/` or `vercel.json`.** They are
  overwritten by the platform, and until then this dealer runs code nobody else
  does. If the gap is real, report it.
- **Do not carry prototype scaffolding across** — `support.js`, `<x-dc>`,
  `<sc-for>`, `style-hover`, `{{ }}` holes. Translate the design, not the runtime.

## Finishing

Report what you built, and — just as important — what you could not: effects the
renderer cannot express, sections whose data the dealer must still supply, and
anything in the prototype that was already broken. Then give the connect steps
from CLAUDE.md §8 so the repo can be opened in the dashboard.
