# Global Elements — Header, Top Nav, Footer, and the Inventory Handoff

Three things are global to a dealer site and are defined **once**, then shared across
every page: the **header** (containing the **top nav**), and the **footer**. They are
stored as reusable elements — editing the shared element updates every page at once.
Never copy chrome into an individual page body.

## Header + top nav

- One header, shown on every page, holding the logo, the top nav, and a primary
  call-to-action (typically "Browse inventory").
- The top nav links to the dealer's real pages plus **Inventory**. The Inventory
  link must always point to `/inventory` (see the handoff below).
- Style the header with tokens. It may be sticky, transparent-on-hero, etc. — design
  freedom applies, but it stays one shared element.

## Footer

- One footer, shown on every page: brand line, secondary nav, contact, legal/year.
- Good place for machine-readable business facts that also help AIO (address, phone,
  hours) — see `aio.md`.

## Editing chrome

When the dealer asks to change the header or footer ("add a phone number to the
header", "make the footer darker"), edit the **shared** header/footer element and
return it as chrome, not as part of a page. The change then appears on every page,
including the inventory pages (below).

## The `/inventory` handoff — read this carefully

`/inventory` and everything under it (`/inventory/trucks/…`, product pages, cart,
checkout) is **not** part of this site's content. It is served by the dealer's
**inventory micro-site**, a separate Remix application, addressed per dealer by the
Vendure channel token.

How it fits together:

- The published brand site (static) proxies `/inventory/*` to the Remix app via a
  rewrite in `vercel.json`. The rewrite embeds the dealer's channel token so Remix
  knows which dealer it is serving. The visitor's URL stays on the dealer's own
  domain the whole time.
- The Remix app reads **this site's exported header and footer** (published to
  `/partials/header.html`, `/partials/footer.html`, plus `/partials/chrome.css` and
  `/partials/tokens.css`) and renders the live inventory, product detail, cart, and
  checkout **in between** that header and footer. So inventory looks like a native
  part of the site even though a different app renders it.

Your responsibilities as the AI:

1. **Never create site content under `/inventory/*`.** No page, no fragment, no route
   there. It is owned by Remix.
2. **Keep the Inventory nav link at `/inventory`.** That link is the entry point to
   the handoff.
3. **Keep the chrome self-contained and token-driven**, because Remix reuses it
   verbatim. Don't put page-specific styling in the header/footer that would leak
   onto inventory pages; chrome CSS should stand on its own.
4. When a dealer says "add inventory to my site," the answer is already true — the
   Inventory link and the rewrite do it. You do not build an inventory listing; you
   make sure the link exists and the header/footer look right, because Remix supplies
   the rest.
