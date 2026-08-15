// Page composition. A page is a list of blocks, not an HTML blob.
//
// That change is what makes template attachment, token propagation and reliable
// tagging possible at all: as long as a page body was opaque markup, nothing
// could reason about what was on it. The editor edits block order and props, the
// AI returns patch operations against the same list, and this module is the one
// thing that turns either into HTML.

import { attrs, cls, join } from './html.mjs';
import { getBlock } from './blocks.mjs';

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Normalise whatever is on disk into a block list. Accepts the canonical
 * `{ blocks: [...] }`, a bare array, and `null` — a page with no page.json is a
 * page with no blocks, not a build failure.
 */
export function parsePage(pageJson) {
  if (Array.isArray(pageJson)) return { version: 1, blocks: pageJson };
  if (isPlainObject(pageJson)) {
    return { version: pageJson.version || 1, blocks: Array.isArray(pageJson.blocks) ? pageJson.blocks : [] };
  }
  return { version: 1, blocks: [] };
}

function renderOne(block, ctx, depth) {
  if (!isPlainObject(block) || !block.type) return '';
  const def = getBlock(block.type);
  if (!def) {
    // A bad block must never take the site down. It warns and disappears.
    if (ctx.warn) ctx.warn(`Unknown block type "${block.type}" (id ${block.id || '?'}) — skipped.`);
    return '';
  }
  if (depth > 0 && def.category === 'section') {
    if (ctx.warn) {
      ctx.warn(`Section block "${block.type}" cannot sit inside a column — skipped.`);
    }
    return '';
  }
  if (!def.autoTagged && ctx.warn) {
    // Surfaced so a certification pilot can exclude pages the platform cannot
    // vouch for; not an error, the block is a supported escape hatch.
    ctx.warn(
      `Page contains a "${block.type}" block (${block.id || '?'}) whose markup is not auto-tagged — ` +
        'analytics attributes are the author\'s responsibility.',
    );
  }

  const props = isPlainObject(block.props) ? block.props : {};
  const inner = def.render(props, ctx, block, (children, childCtx) =>
    renderList(children, childCtx || ctx, depth + 1),
  );
  if (!inner) return '';

  const tag = def.category === 'section' ? 'section' : 'div';
  return `<${tag}${attrs({
    class: cls('bz-block', `bz-block--${block.type}`, props.scope && 'bz-scoped'),
    id: block.anchor || null,
    'data-bz-block': block.id || null,
    'data-bz-block-type': block.type,
    'data-bz-tokens': props.scope || null,
  })}>
${inner}
</${tag}>`;
}

function renderList(blocks, ctx, depth) {
  return join((blocks || []).map((b) => renderOne(b, ctx, depth)));
}

/**
 * Render a page's block list.
 *
 * `ctx` carries everything a block may resolve against: `forms` and `buttons`
 * (the dealer's libraries, keyed by id), `storefrontPrefix`, `businessName`, and
 * a `warn` sink. Nothing in here reaches for a network or a filesystem.
 */
export function renderPage(pageJson, ctx = {}) {
  const page = parsePage(pageJson);
  return renderList(page.blocks, ctx, 0);
}

/** Walk every block in a page, columns included. Used by validation and audits. */
export function walkBlocks(pageJson, visit) {
  const page = parsePage(pageJson);
  const step = (blocks, path) => {
    (blocks || []).forEach((block, i) => {
      if (!isPlainObject(block)) return;
      visit(block, [...path, i]);
      const cols = block.props && block.props.columns;
      if (Array.isArray(cols)) {
        cols.forEach((col, c) => step(col, [...path, i, 'columns', c]));
      }
    });
  };
  step(page.blocks, []);
}

/** Every block id in a page, columns included. Duplicates are reported as-is. */
export function blockIds(pageJson) {
  const ids = [];
  walkBlocks(pageJson, (b) => b.id && ids.push(b.id));
  return ids;
}
