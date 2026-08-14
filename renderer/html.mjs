// HTML primitives shared by every block. Zero dependencies: this module is
// imported by the static Vercel build, by the dashboard canvas and by the
// Vendure plugin's validation pass, so it may not reach for a DOM or Node API.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for interpolation into element content or a double-quoted attribute. */
export function esc(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Serialize an attribute map. `false`, `null` and `undefined` drop the
 * attribute entirely; `true` renders it bare.
 */
export function attrs(map) {
  const out = [];
  for (const [key, value] of Object.entries(map || {})) {
    if (value == null || value === false) continue;
    if (value === true) {
      out.push(key);
      continue;
    }
    out.push(`${key}="${esc(value)}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

/**
 * Analytics tagging attributes. Shift Digital browser-tag certification needs a
 * stable hook on exactly the elements the AI rewrites most often, so blocks emit
 * these structurally rather than relying on the model to remember them.
 */
export function tagAttrs(el, intent) {
  return { 'data-bz-el': el, 'data-bz-intent': intent || null };
}

/** A safe heading level. Blocks take the level as a prop so a page has one h1. */
export function heading(level, text, opts = {}) {
  const n = Math.min(6, Math.max(1, Number(level) || 2));
  if (!text) return '';
  return `<h${n}${attrs({ class: opts.class })}>${opts.raw ? text : esc(text)}</h${n}>`;
}

/**
 * An `<img>` that always carries the attributes the SEO floor requires. A block
 * with no image renders a labelled placeholder rather than a broken image, so a
 * page in progress still builds.
 */
export function image(img, opts = {}) {
  const src = img && typeof img === 'object' ? img.src : img;
  if (!src) {
    return `<div class="bz-photo bz-photo--empty"${attrs({ 'aria-hidden': 'true' })}>${esc(
      opts.placeholder || 'Photo',
    )}</div>`;
  }
  return `<img${attrs({
    src,
    alt: (img && img.alt) || opts.alt || '',
    width: (img && img.width) || opts.width || 1200,
    height: (img && img.height) || opts.height || 800,
    loading: opts.eager ? 'eager' : 'lazy',
    decoding: opts.eager ? 'sync' : 'async',
    class: opts.class,
  })} />`;
}

/** Join rendered children, dropping empties. */
export function join(parts, sep = '\n') {
  return (parts || []).filter((p) => p != null && p !== '').join(sep);
}

/** `class` string built from truthy entries. */
export function cls(...names) {
  return names.filter(Boolean).join(' ');
}

/**
 * Serialize props into a single attribute the hydration client reads back.
 * Single-quoted JSON with escaped quotes, so the payload survives HTML parsing
 * without needing a second script tag per widget.
 */
export function jsonAttr(value) {
  return esc(JSON.stringify(value == null ? null : value));
}

/** Internal link, prefix-aware. External links get rel="noopener". */
export function href(url, ctx) {
  const raw = String(url || '#');
  if (/^(https?:|mailto:|tel:|#)/i.test(raw)) return raw;
  if (!raw.startsWith('/')) return raw;
  // The storefront prefix is preserved, never stripped: links authored as
  // /store/... stay /store/... so the Vercel rewrite hits the Remix mount.
  if (ctx && ctx.storefrontPrefix && raw === '/inventory') return `/${ctx.storefrontPrefix}`;
  return raw;
}

/** Is this URL off-site? */
export function isExternal(url) {
  return /^https?:/i.test(String(url || ''));
}
