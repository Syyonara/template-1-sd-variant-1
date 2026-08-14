# Global Elements — Header, Menus, Footer, and the Storefront Handoff

Three things are global to a dealer site and are defined **once**, then shared across
every page: the **header**, the **menus** it renders, and the **footer**. Editing the
shared element updates every page at once. Never copy chrome into a page body.

## Header

- One header, shown on every page: logo, navigation, and a primary call-to-action.
- The header markup lives in `site/chrome/header.html`. It contains **menu markers**,
  not links:

  ```html
  <nav class="topnav" aria-label="Primary" data-bz-menu="desktop-main">
    <!-- menu:desktop-main -->
  </nav>
  ```

  The build replaces each `<!-- menu:<location> -->` marker with links rendered from
  `site/menus.json`. **Never hand-write nav links into the header.** A menu edit must
  update every page and the storefront partials at once, and that only works if there
  is exactly one source.

- Style the header with tokens. It may be sticky, transparent-on-hero, and so on —
  design freedom applies, but it stays one shared element.

## Menus

`site/menus.json` defines four locations. All four exist on every dealer site:

| Location | Rendered in |
| --- | --- |
| `desktop-main` | header, desktop |
| `mobile-main` | header, mobile disclosure panel |
| `desktop-footer` | footer, desktop |
| `mobile-footer` | footer, mobile |

Each item is `{ "label": "...", "href": "..." }`. Keep an Inventory item pointing at
`/store` in both main menus.

## Footer

- One footer on every page: brand line, footer menu, contact, legal and year.
- A good place for machine-readable business facts that also help AIO (address,
  phone, hours) — see `aio.md`.

## Chrome behaviour

`site/chrome/chrome.js` holds the shared chrome's behaviour (mobile nav disclosure,
footer year). It is platform-owned and also shipped to the storefront. Do not put
page-specific JavaScript in it.

## The `/store` handoff — read this carefully

`/store` and everything under it (`/store/trucks/…`, product pages, cart, checkout)
is **not** part of this site's content. It is served by the dealer's **Remix
storefront**, addressed per dealer and resolved from the request hostname.

How it fits together:

- The published brand site (static) proxies `/store/*` to the Remix app via a rewrite
  in `vercel.json`. The prefix is preserved rather than stripped, because Remix mounts
  both its routes and its client bundles under it. The visitor's URL stays on the
  dealer's own domain throughout.
- The Remix app reads this site's exported chrome from `/partials/` —
  `header.html`, `footer.html`, `chrome.css`, `chrome.js`, `reset.css`, `tokens.css` —
  and the routing contract in `/partials/manifest.json`, then renders live inventory
  **in between** that header and footer.

Your responsibilities:

1. **Never create site content under `/store/*`.** No page, no fragment, no route.
2. **Keep an Inventory item pointing at `/store`** in `menus.json`.
3. **Keep the chrome self-contained and token-driven**, because Remix reuses it
   verbatim. No page-specific styling in the header or footer — it would leak onto
   storefront pages.
4. When a dealer says "add inventory to my site", the answer is already true. Confirm
   the menu item and the chrome look right; Remix supplies the rest.
