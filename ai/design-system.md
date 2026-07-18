# Design System — Token Contract

The design system is a fixed set of **token keys** with **dealer-editable values**.
You (the AI) style everything through these tokens. Dealers change values; you never
add, rename, or remove keys, and you never introduce a second palette or type scale.

At build time the values in `dealer.config.json.brand` are turned into CSS custom
properties in `tokens.css`, alongside a fixed Tailwind-scale layer. Both the static
brand site and the Remix inventory micro-site load the same tokens, so the whole
experience stays consistent.

## Editable (dealer changes the value; from `dealer.config.json.brand`)

| Token                  | CSS variable        | Example      |
|------------------------|---------------------|--------------|
| Primary color          | `--primary`         | `#1a3a5c`    |
| Primary (dark/hover)   | `--primary-dark`    | `#12293f`    |
| Accent color           | `--accent`          | `#e8a020`    |
| Text color             | `--text`            | `#0f172a`    |
| Heading font           | `--font-heading`    | Plus Jakarta |
| Body font              | `--font-body`       | Plus Jakarta |
| Brand corner radius    | `--radius`          | `16px`       |
| Content width          | `--container`       | `1160px`     |

## Fixed scale (never changes — mirrors Tailwind so the Remix app matches)

- **Neutrals (Tailwind slate):** `--gray-50` … `--gray-950`, plus semantic aliases
  `--bg`, `--surface`, `--border`, `--muted`, `--dark`.
- **Spacing:** `--space-1` (.25rem) … `--space-24` (6rem).
- **Radius scale:** `--radius-sm` … `--radius-3xl`, `--radius-full`.
- **Font size:** `--text-xs` … `--text-6xl`.
- **Shadow:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-2xl`.
- **Breakpoints (for `@media`):** sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536.

## Rules

1. **Always reference tokens.** `color: var(--primary)`, `padding: var(--space-6)`,
   `font-size: var(--text-3xl)`, `border-radius: var(--radius-2xl)`. Never a raw hex
   for brand color, never an off-scale spacing/type value for something a token
   covers. One-off geometric values (a specific `max-width`, an aspect ratio) are
   fine; brand color, type, spacing rhythm, and radius are not.
2. **To restyle, change values, not the system.** If the dealer wants "warmer" or "a
   navy rebrand," propose new **values** for `--primary` / `--accent` / fonts and
   apply them once — every page updates. Do not scatter new colors through page CSS.
3. **Adopting an existing brand.** If the dealer has a current site/logo, map their
   real colors and fonts onto `--primary`, `--accent`, `--text`, `--font-heading`,
   `--font-body`. That is how you "match my old site" — through token values.
4. **Contrast is a constraint, not a preference.** When you set token values, keep
   text/background contrast at WCAG AA or better.
