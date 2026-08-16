// Per-node style overrides — the instance layer of the cascade.
//
// The design system answers "what does this site look like"; props answer
// "which of the design system's options does this node use"; this layer answers
// "this one node, specifically, wants something else". The order is:
//
//   design tokens  →  component CSS  →  node props  →  node styles (this file)
//
// Overrides live on the node as `styles: { base, tablet, mobile }` and compile
// to CSS keyed on the node's own id — `[data-bz-node="hero"] { … }` — which
// every rendered node already carries. The renderer's markup does not change at
// all; the same compiled stylesheet serves the published build and the editor
// canvas, so an override looks identical in both.
//
// The field set is a fixed whitelist, not free CSS. Free CSS is a page the
// design system cannot reach and the AI cannot reason about; a whitelist keeps
// every consumer — the style panel, the validator, the AI contract — agreeing
// on what an override can say, exactly the way the block catalogue already
// works for props.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Colour: a hex value, or one of the design system's surface/text tokens. */
const COLOR_TOKENS = ['accent', 'accentDark', 'ink', 'inkDark', 'muted', 'line', 'card', 'paper'];
const color = value => {
  if (typeof value !== 'string') return null;
  if (COLOR_TOKENS.includes(value)) return `var(--${value.replace(/[A-Z]/g, c => '-' + c.toLowerCase())})`;
  return HEX.test(value.trim()) ? value.trim() : null;
};

/** Length in pixels, bounded so a typo cannot push a page into absurdity. */
const px = (max = 400) => value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? `${Math.round(n)}px` : null;
};

const oneOf = options => value => (options.includes(value) ? String(value) : null);

const SHADOWS = { none: 'none', sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' };

/**
 * Everything an override may set. `css` is the property emitted; `accepts`
 * normalises and validates the stored value — a value it returns null for is
 * dropped, never emitted.
 */
export const STYLE_FIELDS = {
  background: { css: 'background', accepts: color, label: 'Background' },
  textColor: { css: 'color', accepts: color, label: 'Text colour' },
  paddingTop: { css: 'padding-top', accepts: px(), label: 'Padding top' },
  paddingRight: { css: 'padding-right', accepts: px(), label: 'Padding right' },
  paddingBottom: { css: 'padding-bottom', accepts: px(), label: 'Padding bottom' },
  paddingLeft: { css: 'padding-left', accepts: px(), label: 'Padding left' },
  marginTop: { css: 'margin-top', accepts: px(), label: 'Margin top' },
  marginBottom: { css: 'margin-bottom', accepts: px(), label: 'Margin bottom' },
  textAlign: { css: 'text-align', accepts: oneOf(['left', 'center', 'right']), label: 'Text align' },
  maxWidth: { css: 'max-width', accepts: px(1920), label: 'Max width' },
  radius: { css: 'border-radius', accepts: px(80), label: 'Corner radius' },
  gap: { css: 'gap', accepts: px(160), label: 'Gap' },
  shadow: {
    css: 'box-shadow',
    accepts: value => SHADOWS[value] ?? null,
    label: 'Shadow',
    options: Object.keys(SHADOWS),
  },
};

/**
 * Desktop-first buckets, the way every mainstream builder reads them: `base`
 * applies everywhere, `tablet` narrows it at 1023px and below, `mobile` again
 * at 767px and below. The breakpoints are the two blocks.css already uses.
 */
export const STYLE_BUCKETS = [
  { key: 'base', media: null },
  { key: 'tablet', media: '(max-width: 1023px)' },
  { key: 'mobile', media: '(max-width: 767px)' },
];

/** Normalise whatever is stored into { base, tablet, mobile } of valid fields only. */
export function sanitizeStyles(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const bucket of STYLE_BUCKETS) {
    const values = raw[bucket.key];
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    const kept = {};
    for (const [field, value] of Object.entries(values)) {
      const spec = STYLE_FIELDS[field];
      if (!spec) continue;
      if (value === null || value === undefined || value === '') continue;
      if (spec.accepts(value) !== null) kept[field] = value;
    }
    if (Object.keys(kept).length) out[bucket.key] = kept;
  }
  return Object.keys(out).length ? out : null;
}

/** Style keys in `raw` that the whitelist does not know — for validator messages. */
export function unknownStyleKeys(raw) {
  const unknown = [];
  if (!raw || typeof raw !== 'object') return unknown;
  for (const [bucketKey, values] of Object.entries(raw)) {
    if (!STYLE_BUCKETS.some(b => b.key === bucketKey)) {
      unknown.push(bucketKey);
      continue;
    }
    for (const field of Object.keys(values ?? {})) {
      if (!STYLE_FIELDS[field]) unknown.push(`${bucketKey}.${field}`);
    }
  }
  return unknown;
}

function declarationsFor(values) {
  const lines = [];
  for (const [field, value] of Object.entries(values ?? {})) {
    const spec = STYLE_FIELDS[field];
    if (!spec) continue;
    const compiled = spec.accepts(value);
    if (compiled !== null) lines.push(`${spec.css}:${compiled}`);
  }
  return lines;
}

/**
 * Compile every override in a document to one stylesheet.
 *
 * Emitted per node id, in tree order, base rules first and then one media block
 * per breakpoint. The selector doubles the attribute for weight —
 * `[data-bz-node="x"][data-bz-node]` — so an instance override outranks the
 * single-attribute and single-class rules the component stylesheet uses,
 * without importants and without depending on file order.
 */
export function compileNodeStyles(nodes) {
  const perBucket = { base: [], tablet: [], mobile: [] };
  const walk = list => {
    for (const node of list ?? []) {
      if (!node || typeof node !== 'object') continue;
      const styles = node.id ? sanitizeStyles(node.styles) : null;
      if (styles) {
        for (const bucket of STYLE_BUCKETS) {
          const lines = declarationsFor(styles[bucket.key]);
          if (lines.length) {
            perBucket[bucket.key].push(`[data-bz-node="${node.id}"][data-bz-node]{${lines.join(';')}}`);
          }
        }
      }
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(nodes);

  const parts = [...perBucket.base];
  for (const bucket of STYLE_BUCKETS) {
    if (!bucket.media || !perBucket[bucket.key].length) continue;
    parts.push(`@media ${bucket.media}{${perBucket[bucket.key].join('')}}`);
  }
  return parts.join('\n');
}
