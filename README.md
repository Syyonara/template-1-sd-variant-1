# template-1-sd-variant-1 — a design variant

A **variant** of the dealer site template, built to carry a different design system. It is
not the canonical template: that is [`../dealer-site-template/`](../dealer-site-template/),
which is what `WEBSITE_TEMPLATE_REPO` points at and what the platform generates dealer repos
from.

This repo appears in `WEBSITE_CLONE_REPOS`, so a dealer may choose it as a starting point on
first run.

```bash
npm install        # nothing to install — zero dependencies. Node 20+.
npm run validate   # every site/ file against the renderer's rules   <- run this first
npm test
npm run build      # site/ -> dist/
npm run check      # all three, in order
npm run schemas    # regenerate renderer/block-schemas.json
```

## Its renderer has drifted from the canonical one

`renderer/index.mjs` here declares `RENDERER_VERSION = '4.9.0'`, the same as
`dealer-site-template`, **but the files differ** — this is an older 4.9.0. Verified on
2 September 2026:

| File | Changed lines vs. the template |
|---|---|
| `client/widgets.js` | 69 |
| `widgets.mjs` | 61 |
| `html.mjs` | 53 |
| `index.mjs` | 15 |
| `ops.mjs`, `custom-widgets.mjs`, `blocks.css` | 11 each |
| `document-assets.mjs` | 7 |
| `nodes.mjs` | 4 |
| `blocks.mjs` | 2 |

Its `index.mjs` does not export `isSiteAssetPath`, `resolveAssetUrl` or `rewriteAssetUrls`.

**Treat behaviour observed here as unreliable evidence about the platform**, and do not use
this repo to reason about renderer behaviour. Check against `dealer-site-template` instead.
Recorded as G-10 in [`../vendure/docs/11-gaps-and-backlog.md`](../vendure/docs/11-gaps-and-backlog.md);
resyncing or re-versioning it is item B-06.

## Documentation

Same as the canonical template — the design differs, the model does not.

| Read this | For |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Authoring guide for this repo |
| [`../dealer-site-template/README.md`](../dealer-site-template/README.md) | Layout, what the build emits, the parity rule, how a repo is connected |
| [`../vendure/docs/07-block-model-reference.md`](../vendure/docs/07-block-model-reference.md) | **Complete reference** — transcribed from the canonical template's `renderer/block-schemas.json` |
| [`../vendure/docs/README.md`](../vendure/docs/README.md) | The rest of the platform |

`renderer/`, `scripts/`, `ai/`, `vercel.json` and `dealer.config.schema.json` are
platform-owned. Everything under `site/` and `public/`, and `dealer.config.json` apart from
the identity fields the platform fills in, is yours.
