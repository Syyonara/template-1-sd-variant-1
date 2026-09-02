# Building a dealer brand site in this repository

This repo is a **design variant** of the BuzzNerd dealer site template. The design system
differs; the document model, the block catalogue and every rule about authoring are the same.

**The authoring guide is
[`../dealer-site-template/CLAUDE.md`](../dealer-site-template/CLAUDE.md). Read it.** This
file used to be a copy of it, and the copy drifted — it was missing the behaviours-first
guidance, the designed-component vs. coded-widget distinction, and the repeated-shape rules.
One copy is the fix.

| Read this | For |
|---|---|
| [`../dealer-site-template/CLAUDE.md`](../dealer-site-template/CLAUDE.md) | **How to author here** — the document model, what is writable, libraries vs. literals, navigation, behaviours, the design-handoff workflow |
| [`../vendure/docs/07-block-model-reference.md`](../vendure/docs/07-block-model-reference.md) | **Complete reference** — every block, prop and allowed value; the 8 behaviours and their parts; the 70 style fields; the token map; file shapes; validator rules |
| [`../vendure/docs/06-website-builder.md`](../vendure/docs/06-website-builder.md) | How the platform provisions, saves to, publishes and syncs a repo like this one |
| [`../vendure/docs/README.md`](../vendure/docs/README.md) | The rest of the platform |
| [`README.md`](./README.md) | What this repo is, and its renderer drift |

---

## The one thing specific to this repo

**Its renderer has drifted from the canonical one.** `renderer/index.mjs` declares
`RENDERER_VERSION = '4.9.0'`, the same as `dealer-site-template`, but the files differ — this
is an older 4.9.0, and its `index.mjs` does not export `isSiteAssetPath`, `resolveAssetUrl`
or `rewriteAssetUrls`. `README.md` has the per-file breakdown.

So: **do not use this repo to reason about renderer behaviour.** If you need to know what the
renderer does, read `../dealer-site-template/renderer/` or
`../dealer-site-template/renderer/block-schemas.json`. Anything you observe by building here
may be two behaviours behind.

## The gate

```bash
npm install          # nothing to install — zero dependencies. Node 20+.
npm run validate     # every site/ file against the renderer's rules   <- must pass
npm test
npm run build        # site/ -> dist/
npm run check        # all three, in order
```

`npm run validate` must pass before you push. It reports the file, the path inside it and the
fix, including the cross-file references — a `formId` with no form, a menu item pointing at a
deleted page — that no single-file check can see.

Because of the drift above, also validate against the canonical renderer before trusting a
pass:

```bash
cd ../dealer-site-template && npm run validate -- --root ../template-1-sd-variant-1
```

## What you may and may not write

| Path | |
|---|---|
| `site/**`, `public/**` | **Yours.** All content and static assets |
| `dealer.config.json` | **Yours**, except `channelToken`, `domain`, `url` and `storefrontOrigin` — leave those as their `REPLACE_…` placeholders for the platform to fill in |
| `renderer/**`, `scripts/**`, `ai/**`, `vercel.json`, `dealer.config.schema.json` | **Platform-owned. Do not edit.** The platform overwrites these when it syncs a repo forward, so an edit here is lost — and until it is lost, this dealer is running a renderer nobody else is |

If something you need cannot be expressed in `site/`, that is a platform gap worth reporting,
not a reason to edit `renderer/`.
