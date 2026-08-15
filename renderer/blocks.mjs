// The block library — the unit a page is composed of.
//
// A page is a list of `{ id, type, props }`. Every entry here pairs a renderer
// with a JSON Schema, and the schema is the contract three consumers depend on:
// the AI generates instances against it, the editor builds its inspector from
// it, and the save path validates against it. Adding a block means adding both
// halves in one place.
//
// Two rules hold for every block, structurally rather than by convention:
//
//  1. Interactive elements carry `data-bz-el` / `data-bz-intent`. The caller
//     never has to ask. This is what makes browser-tag certification a one-time
//     platform exercise instead of a per-dealer fix-up after every AI edit.
//  2. Blocks take `headingLevel` rather than hardcoding `<h1>`, so a page keeps
//     exactly one h1 no matter which blocks it is assembled from.

import { attrs, cls, esc, heading, href, image, isExternal, join, tagAttrs } from './html.mjs';
import { renderForm } from './forms.mjs';
import { renderMenu } from './menus.mjs';
import { renderWidget } from './widgets.mjs';

/* ------------------------------------------------------------------ schemas */

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const bool = (description) => ({ type: 'boolean', description });

const HEADING_LEVEL = int('Heading level for this block. Keep one h1 per page.', {
  minimum: 1,
  maximum: 6,
  default: 2,
});

const ALIGN = str('Text alignment.', { enum: ['left', 'center'], default: 'left' });

const IMAGE_SCHEMA = {
  type: 'object',
  description: 'An uploaded image, referenced by public URL. Never a base64 data URI.',
  properties: {
    src: str('Public image URL from the media library.'),
    alt: str('Descriptive alternative text. Required for anything not decorative.'),
    width: int('Intrinsic width in pixels.'),
    height: int('Intrinsic height in pixels.'),
  },
  required: ['src', 'alt'],
};

/**
 * A call to action. `ctaId` points at an entry in the dealer's Buttons library
 * (`site/buttons.json`), which is how a CTA stays consistent across pages and
 * carries the tagging values the attribute panel edits. Inline label/url is the
 * fallback for a one-off.
 */
const CTA_SCHEMA = {
  type: 'object',
  description:
    'A call to action. Prefer `ctaId` referencing the dealer\'s Buttons library over an inline label/url — a library CTA keeps its label, destination and tagging consistent everywhere it appears.',
  properties: {
    ctaId: str('Id of an entry in site/buttons.json.'),
    label: str('Inline label. Overrides the library label when both are set.'),
    url: str('Inline destination. Overrides the library destination.'),
    style: str('Visual variant.', { enum: ['primary', 'secondary', 'link'] }),
    intent: str('Analytics intent, e.g. "get-quote". Defaults to the library value.'),
  },
};

const CTAS_SCHEMA = {
  type: 'array',
  description: 'Calls to action, in order.',
  items: CTA_SCHEMA,
  maxItems: 3,
};

const STATS_SCHEMA = {
  type: 'array',
  description: 'Short proof points. Keep values terse — "39 yrs", "12k+".',
  items: {
    type: 'object',
    properties: { value: str('The figure.'), label: str('What it counts.') },
    required: ['value', 'label'],
  },
};

/* ------------------------------------------------------------------ helpers */

function levelOf(props) {
  return Math.min(6, Math.max(1, Number(props.headingLevel) || 2));
}

function container(inner, extra) {
  return `<div class="${cls('bz-container', extra)}">${inner}</div>`;
}

/**
 * Resolve a CTA reference against the dealer's Buttons library. An unknown
 * `ctaId` degrades to whatever inline values exist rather than rendering a
 * dead button, and records a warning so the editor can flag it.
 */
export function resolveCta(ref, ctx) {
  if (!ref) return null;
  const lib = (ctx && ctx.buttons) || {};
  const base = ref.ctaId ? lib[ref.ctaId] : null;
  if (ref.ctaId && !base && ctx && ctx.warn) {
    ctx.warn(`CTA "${ref.ctaId}" is not in site/buttons.json — rendered from inline values.`);
  }
  const label = ref.label || (base && base.label) || '';
  const url = ref.url || (base && base.url) || '';
  if (!label) return null;
  return {
    id: ref.ctaId || null,
    label,
    url,
    style: ref.style || (base && base.style) || 'primary',
    intent: ref.intent || (base && base.intent) || 'cta',
    newTab: base ? !!base.newTab : false,
    formId: (base && base.formId) || null,
  };
}

function renderCta(ref, ctx, opts = {}) {
  const cta = resolveCta(ref, ctx);
  if (!cta) return '';
  const external = isExternal(cta.url);
  // A CTA whose destination is a form opens that form rather than navigating,
  // so the Buttons library stays the single place a lead-capture entry point is
  // defined. The hydration client binds the dialog; without JS it still links.
  return `<a${attrs({
    class: cls('bz-btn', `bz-btn--${cta.style}`, opts.onDark && 'bz-btn--on-dark'),
    href: href(cta.url || (cta.formId ? `#form-${cta.formId}` : '#'), ctx),
    target: cta.newTab ? '_blank' : null,
    rel: external || cta.newTab ? 'noopener' : null,
    'data-bz-cta': cta.id,
    'data-bz-form': cta.formId,
    ...tagAttrs('cta', cta.intent),
  })}>${esc(cta.label)}</a>`;
}

function renderCtas(refs, ctx, opts = {}) {
  const html = join((refs || []).map((r) => renderCta(r, ctx, opts)), '');
  return html ? `<div class="bz-btns">${html}</div>` : '';
}

function eyebrow(text) {
  return text ? `<p class="bz-eyebrow">${esc(text)}</p>` : '';
}

function statList(stats, extra) {
  if (!stats || !stats.length) return '';
  return `<dl class="${cls('bz-stats', extra)}">${join(
    stats.map(
      (s) =>
        `<div class="bz-stat"><dt class="bz-stat__v">${esc(s.value)}</dt><dd class="bz-stat__l">${esc(
          s.label,
        )}</dd></div>`,
    ),
    '',
  )}</dl>`;
}

/* ------------------------------------------------------------------- blocks */

const BLOCKS = {
  /* ------------------------------------------------------------ layout */

  row: {
    label: 'Columns',
    category: 'layout',
    schema: {
      type: 'object',
      properties: {
        columns: {
          type: 'array',
          description:
            'Two or three columns, each a list of content blocks. Columns never nest, and a section block is never placed inside one — sections are always full-width and top-level.',
          minItems: 2,
          maxItems: 3,
          items: { type: 'array', items: { $ref: '#/definitions/contentBlock' } },
        },
        align: str('Vertical alignment of the columns.', {
          enum: ['start', 'center'],
          default: 'start',
        }),
      },
      required: ['columns'],
    },
    render(props, ctx, block, renderChildren) {
      const columns = Array.isArray(props.columns) ? props.columns.slice(0, 3) : [];
      if (columns.length < 2) return '';
      // data-bz-slot marks a place children may go. The editor uses it as a drop
      // target; the published page ignores it. Emitting it in both keeps the
      // canvas and the build agreeing about where nesting is allowed rather than
      // the editor guessing.
      const cells = columns.map(
        (col, i) => `<div class="bz-col" data-bz-slot="${i}">${renderChildren(col, ctx)}</div>`,
      );
      return container(
        `<div class="${cls(`bz-row bz-row--${columns.length}`, props.align === 'center' && 'bz-row--mid')}">${join(
          cells,
          '',
        )}</div>`,
      );
    },
  },

  spacer: {
    label: 'Spacer',
    category: 'layout',
    schema: {
      type: 'object',
      properties: { size: int('Step on the spacing scale.', { minimum: 1, maximum: 10, default: 6 }) },
    },
    render(props) {
      const size = Math.min(10, Math.max(1, Number(props.size) || 6));
      return `<div class="bz-spacer" style="height:var(--space-${size})" aria-hidden="true"></div>`;
    },
  },

  divider: {
    label: 'Divider',
    category: 'layout',
    schema: { type: 'object', properties: {} },
    render() {
      return container('<hr class="bz-hr" />');
    },
  },

  /* ----------------------------------------------------------- content */

  heading: {
    label: 'Heading',
    category: 'content',
    schema: {
      type: 'object',
      properties: {
        text: str('The heading text.'),
        eyebrow: str('Small label above the heading.'),
        headingLevel: HEADING_LEVEL,
        align: ALIGN,
      },
      required: ['text'],
    },
    render(props) {
      return container(
        `<div class="${cls('bz-headingblock', props.align === 'center' && 'bz-center')}">${eyebrow(
          props.eyebrow,
        )}${heading(levelOf(props), props.text)}</div>`,
      );
    },
  },

  text: {
    label: 'Text',
    category: 'content',
    schema: {
      type: 'object',
      properties: {
        text: str(
          'Body copy. Plain paragraphs separated by a blank line; inline <strong>, <em> and <a> are allowed.',
        ),
        align: ALIGN,
        width: str('Measure.', { enum: ['prose', 'full'], default: 'prose' }),
      },
      required: ['text'],
    },
    render(props, ctx) {
      const paras = String(props.text || '')
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${inlineHtml(p, ctx)}</p>`);
      if (!paras.length) return '';
      return container(
        `<div class="${cls(
          'bz-text',
          props.width !== 'full' && 'bz-prose',
          props.align === 'center' && 'bz-center',
        )}">${join(paras, '')}</div>`,
      );
    },
  },

  image: {
    label: 'Image',
    category: 'content',
    schema: {
      type: 'object',
      properties: {
        image: IMAGE_SCHEMA,
        caption: str('Optional caption shown under the image.'),
        width: str('How wide the image sits.', { enum: ['prose', 'full'], default: 'full' }),
      },
      required: ['image'],
    },
    render(props) {
      const fig = `<figure class="${cls('bz-figure', props.width === 'prose' && 'bz-prose')}">${image(
        props.image,
      )}${props.caption ? `<figcaption>${esc(props.caption)}</figcaption>` : ''}</figure>`;
      return container(fig);
    },
  },

  buttons: {
    label: 'Buttons',
    category: 'content',
    schema: {
      type: 'object',
      properties: { items: CTAS_SCHEMA, align: ALIGN },
      required: ['items'],
    },
    render(props, ctx) {
      const html = renderCtas(props.items, ctx);
      if (!html) return '';
      return container(`<div class="${cls(props.align === 'center' && 'bz-center')}">${html}</div>`);
    },
  },

  list: {
    label: 'Feature list',
    category: 'content',
    schema: {
      type: 'object',
      properties: {
        heading: str('Optional heading above the list.'),
        headingLevel: HEADING_LEVEL,
        columns: int('Columns at desktop width.', { minimum: 1, maximum: 4, default: 3 }),
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: str('Item title.'), desc: str('One or two supporting sentences.') },
            required: ['label'],
          },
        },
      },
      required: ['items'],
    },
    render(props) {
      const cols = Math.min(4, Math.max(1, Number(props.columns) || 3));
      const items = (props.items || []).map(
        (it) =>
          `<li class="bz-feature"><h${levelOf(props) + 1} class="bz-feature__t">${esc(
            it.label,
          )}</h${levelOf(props) + 1}>${
            it.desc ? `<p class="bz-feature__d">${esc(it.desc)}</p>` : ''
          }</li>`,
      );
      if (!items.length) return '';
      return container(
        `${heading(levelOf(props), props.heading)}<ul class="bz-grid bz-grid--${cols} bz-bare">${join(
          items,
          '',
        )}</ul>`,
      );
    },
  },

  customHtml: {
    label: 'Custom HTML',
    category: 'content',
    /**
     * The escape hatch. Flagged as untagged in the registry because the platform
     * cannot vouch for analytics attributes inside markup it did not generate —
     * the editor surfaces that to the dealer and the build warns on it, so a
     * certification pilot can exclude these pages.
     */
    autoTagged: false,
    schema: {
      type: 'object',
      properties: { html: str('Raw HTML fragment. No <script>, no document shell.') },
      required: ['html'],
    },
    render(props) {
      return container(`<div class="bz-custom">${stripUnsafe(props.html)}</div>`);
    },
  },

  form: {
    label: 'Form',
    category: 'content',
    schema: {
      type: 'object',
      properties: {
        formId: str(
          "Id of a form in the dealer's Forms library (site/forms/<id>.json). Never invent form fields inline — reference a library form so routing, consent and validation stay in one place.",
        ),
        heading: str('Optional heading above the form.'),
        headingLevel: HEADING_LEVEL,
        intro: str('One short line under the heading.'),
      },
      required: ['formId'],
    },
    render(props, ctx) {
      const form = ((ctx && ctx.forms) || {})[props.formId];
      if (!form) {
        if (ctx && ctx.warn) ctx.warn(`Form "${props.formId}" is not in site/forms/ — block skipped.`);
        return '';
      }
      return container(
        `<div class="bz-formblock">${heading(levelOf(props), props.heading)}${
          props.intro ? `<p class="bz-lede">${esc(props.intro)}</p>` : ''
        }${renderForm(form, ctx)}</div>`,
      );
    },
  },

  widget: {
    label: 'Widget',
    category: 'widget',
    schema: {
      type: 'object',
      properties: {
        widget: str('Widget id from the platform registry, e.g. "locations-map".'),
        config: {
          type: 'object',
          description: "Widget props, validated against that widget's own schema.",
        },
      },
      required: ['widget'],
    },
    render(props, ctx, block) {
      return renderWidget(props, ctx, block);
    },
  },

  /* ------------------------------------------------------------ chrome */
  // These are what a header or footer template is built from. They are ordinary
  // blocks, edited in the same canvas as a page, because "the header is a
  // template you edit like a page" is the whole point of the theme builder.

  bar: {
    label: 'Bar',
    category: 'chrome',
    schema: {
      type: 'object',
      properties: {
        columns: {
          type: 'array',
          description:
            'Two or three groups laid out across the bar — typically logo, navigation, and a call to action.',
          minItems: 1,
          maxItems: 3,
          items: { type: 'array', items: { $ref: '#/definitions/contentBlock' } },
        },
        background: str('Bar background.', {
          enum: ['card', 'paper', 'ink', 'transparent'],
          default: 'card',
        }),
        sticky: bool('Keep the bar in view as the page scrolls.'),
        density: str('Vertical padding.', { enum: ['compact', 'regular'], default: 'regular' }),
        divider: bool('Draw a hairline under the bar.'),
      },
      required: ['columns'],
    },
    render(props, ctx, block, renderChildren) {
      const columns = Array.isArray(props.columns) ? props.columns.slice(0, 3) : [];
      if (!columns.length) return '';
      const inner = columns.map(
        (col, i) => `<div class="bz-bar__cell" data-bz-slot="${i}">${renderChildren(col, ctx)}</div>`,
      );
      return `<div class="${cls(
        'bz-bar',
        `bz-bar--${props.background || 'card'}`,
        props.density === 'compact' && 'bz-bar--compact',
        props.sticky && 'bz-bar--sticky',
        props.divider && 'bz-bar--divider',
      )}"><div class="bz-container bz-bar__inner">${join(inner, '')}</div></div>`;
    },
  },

  logo: {
    label: 'Logo',
    category: 'chrome',
    schema: {
      type: 'object',
      properties: {
        image: IMAGE_SCHEMA,
        /* Falls back to the business name so a site with no logo uploaded yet
           still shows something a visitor can click home. */
        text: str('Shown when there is no logo image. Defaults to the business name.'),
        url: str('Where the logo links.', { default: '/' }),
        height: int('Rendered height in pixels.', { minimum: 16, maximum: 120, default: 34 }),
      },
    },
    render(props, ctx) {
      const label = props.text || (ctx && ctx.businessName) || 'Home';
      const inner =
        props.image && props.image.src
          ? image(
              { ...props.image, alt: props.image.alt || label },
              { eager: true, class: 'bz-logo__img', height: props.height || 34 },
            )
          : `<span class="bz-logo__word">${esc(label)}</span>`;
      return `<a class="bz-brand" href="${esc(href(props.url || '/', ctx))}"${attrs({
        style: props.height ? `--bz-logo-h:${Number(props.height)}px` : null,
        'data-bz-el': 'logo',
      })}>${inner}</a>`;
    },
  },

  menu: {
    label: 'Menu',
    category: 'chrome',
    schema: {
      type: 'object',
      properties: {
        /* A location is the usual choice — "whatever is assigned to Primary" —
           so swapping the site's main menu is one change in Menus rather than an
           edit to every template that shows it. */
        location: str(
          'Which menu to show. Use a location id (primary, mobile, footer, legal, utility) so the menu can be swapped from the Menus screen, or a menu id to pin one specific menu.',
        ),
        layout: str('Direction.', { enum: ['horizontal', 'vertical'], default: 'horizontal' }),
        collapseOnMobile: bool('Collapse behind a menu button on small screens.', ),
        align: str('Alignment within its cell.', { enum: ['start', 'center', 'end'], default: 'start' }),
      },
      required: ['location'],
    },
    render(props, ctx) {
      const html = renderMenu(ctx && ctx.menus, props.location, ctx);
      if (!html) {
        // An unassigned location is a normal state during setup, so the editor
        // shows a hint rather than nothing at all — an invisible block is
        // indistinguishable from a broken one.
        return ctx && ctx.editing
          ? `<p class="bz-widget__empty">No menu assigned to “${esc(props.location)}” yet.</p>`
          : '';
      }
      const nav = `<nav class="${cls(
        'bz-menu',
        `bz-menu--${props.layout || 'horizontal'}`,
        `bz-menu--${props.align || 'start'}`,
      )}" aria-label="${esc(props.location)}">${html}</nav>`;
      if (!props.collapseOnMobile) return nav;
      return `<div class="bz-menu-wrap" data-bz-collapse>
  <button class="bz-menu-toggle" type="button" aria-expanded="false" aria-label="Menu"><span></span><span></span><span></span></button>
  ${nav}
</div>`;
    },
  },

  /* ---------------------------------------------------------- sections */

  hero: {
    label: 'Hero (full-bleed)',
    category: 'section',
    schema: {
      type: 'object',
      properties: {
        eyebrow: str('Small label above the headline.'),
        headline: str('The page promise, one line.'),
        subhead: str('Two sentences at most.'),
        ctas: CTAS_SCHEMA,
        image: IMAGE_SCHEMA,
        showSearch: bool('Show the inventory search bar.'),
        headingLevel: HEADING_LEVEL,
      },
      required: ['headline'],
    },
    render(props, ctx) {
      const search = props.showSearch
        ? `<form class="bz-herosearch" action="/${
            (ctx && ctx.storefrontPrefix) || 'store'
          }" method="get" role="search"${attrs(tagAttrs('form', 'inventory-search'))}>
  <label class="bz-herosearch__l" for="bz-hero-q">Search inventory</label>
  <input class="bz-input" id="bz-hero-q" name="q" type="search" placeholder="Search inventory…" />
  <button class="bz-btn bz-btn--primary" type="submit"${attrs(
    tagAttrs('cta', 'inventory-search'),
  )}>Search</button>
</form>`
        : '';
      return `<div class="bz-hero__bg">${
        props.image && props.image.src
          ? image(props.image, { eager: true, class: 'bz-hero__img' })
          : ''
      }</div>${container(
        `<div class="bz-hero__copy">${eyebrow(props.eyebrow)}${heading(
          levelOf(props),
          props.headline,
          { class: 'bz-hero__h' },
        )}${props.subhead ? `<p class="bz-hero__sub">${esc(props.subhead)}</p>` : ''}${renderCtas(
          props.ctas,
          ctx,
          { onDark: true },
        )}${search}</div>`,
      )}`;
    },
  },

  splitHero: {
    label: 'Split hero (photo)',
    category: 'section',
    schema: {
      type: 'object',
      properties: {
        badge: str('Short credibility line, e.g. "Manufacturer-direct since 1987".'),
        headline: str('The page promise, one line.'),
        subhead: str('Two sentences at most.'),
        ctas: CTAS_SCHEMA,
        stats: STATS_SCHEMA,
        image: IMAGE_SCHEMA,
        headingLevel: HEADING_LEVEL,
      },
      required: ['headline'],
    },
    render(props, ctx) {
      return container(
        `<div class="bz-split">
  <div class="bz-split__copy">${
    props.badge ? `<p class="bz-badge">${esc(props.badge)}</p>` : ''
  }${heading(levelOf(props), props.headline)}${
          props.subhead ? `<p class="bz-lede">${esc(props.subhead)}</p>` : ''
        }${renderCtas(props.ctas, ctx)}${statList(props.stats, 'bz-stats--inline')}</div>
  <div class="bz-split__media">${image(props.image, { eager: true, placeholder: 'Product photo' })}</div>
</div>`,
      );
    },
  },

  iconGrid: {
    label: 'Quick links',
    category: 'section',
    schema: {
      type: 'object',
      properties: {
        heading: str('Optional heading.'),
        headingLevel: HEADING_LEVEL,
        items: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              label: str('Shortcut title.'),
              desc: str('One sentence.'),
              url: str('Destination.'),
            },
            required: ['label'],
          },
        },
      },
      required: ['items'],
    },
    render(props, ctx) {
      const items = (props.items || []).slice(0, 4);
      if (!items.length) return '';
      const cells = items.map((it) => {
        const inner = `<h${levelOf(props) + 1} class="bz-quick__t">${esc(it.label)}</h${
          levelOf(props) + 1
        }>${it.desc ? `<p class="bz-quick__d">${esc(it.desc)}</p>` : ''}`;
        return it.url
          ? `<a class="bz-quick" href="${esc(href(it.url, ctx))}"${attrs(
              tagAttrs('link', 'quick-link'),
            )}>${inner}</a>`
          : `<div class="bz-quick">${inner}</div>`;
      });
      return container(
        `${heading(levelOf(props), props.heading)}<div class="bz-grid bz-grid--${items.length}">${join(
          cells,
          '',
        )}</div>`,
      );
    },
  },

  categoryGrid: {
    label: 'Category grid',
    category: 'section',
    schema: {
      type: 'object',
      properties: {
        heading: str('Optional heading.'),
        headingLevel: HEADING_LEVEL,
        cta: CTA_SCHEMA,
        items: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            properties: {
              label: str('Card title.'),
              meta: str('Second line, e.g. "New · $24,900".'),
              url: str('Destination.'),
              image: IMAGE_SCHEMA,
            },
            required: ['label'],
          },
        },
      },
      required: ['items'],
    },
    render(props, ctx) {
      const items = props.items || [];
      if (!items.length) return '';
      const cols = Math.min(4, items.length);
      const cards = items.map((it) => {
        const inner = `${image(it.image, { placeholder: 'Photo' })}<div class="bz-card__body"><span class="bz-card__t">${esc(
          it.label,
        )}</span>${it.meta ? `<span class="bz-card__m">${esc(it.meta)}</span>` : ''}</div>`;
        return it.url
          ? `<a class="bz-card" href="${esc(href(it.url, ctx))}"${attrs(
              tagAttrs('link', 'view-listing'),
            )}>${inner}</a>`
          : `<div class="bz-card">${inner}</div>`;
      });
      return container(
        `<div class="bz-sechead">${heading(levelOf(props), props.heading)}${renderCtas(
          props.cta ? [props.cta] : [],
          ctx,
        )}</div><div class="bz-grid bz-grid--${cols}">${join(cards, '')}</div>`,
      );
    },
  },

  statBand: {
    label: 'Stat band',
    category: 'section',
    schema: {
      type: 'object',
      properties: {
        heading: str('The claim.'),
        body: str('Two sentences supporting it.'),
        ctas: CTAS_SCHEMA,
        stats: STATS_SCHEMA,
        headingLevel: HEADING_LEVEL,
      },
      required: ['stats'],
    },
    render(props, ctx) {
      return container(
        `<div class="bz-band">
  <div>${heading(levelOf(props), props.heading)}${
          props.body ? `<p class="bz-band__b">${esc(props.body)}</p>` : ''
        }${renderCtas(props.ctas, ctx, { onDark: true })}</div>
  ${statList(props.stats)}
</div>`,
      );
    },
  },

  serviceGrid: {
    label: 'Service grid',
    category: 'section',
    schema: {
      type: 'object',
      properties: {
        heading: str('Section heading.'),
        body: str('One or two sentences.'),
        headingLevel: HEADING_LEVEL,
        items: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              label: str('Service name.'),
              desc: str('What it covers.'),
              cta: CTA_SCHEMA,
            },
            required: ['label'],
          },
        },
      },
      required: ['items'],
    },
    render(props, ctx) {
      const items = (props.items || []).slice(0, 4);
      if (!items.length) return '';
      const cards = items.map(
        (it) =>
          `<div class="bz-service"><h${levelOf(props) + 1} class="bz-service__t">${esc(
            it.label,
          )}</h${levelOf(props) + 1}>${
            it.desc ? `<p class="bz-service__d">${esc(it.desc)}</p>` : ''
          }${renderCta(it.cta, ctx, { onDark: true })}</div>`,
      );
      return container(
        `${heading(levelOf(props), props.heading)}${
          props.body ? `<p class="bz-lede bz-lede--on-dark">${esc(props.body)}</p>` : ''
        }<div class="bz-grid bz-grid--${items.length}">${join(cards, '')}</div>`,
      );
    },
  },

  testimonials: {
    label: 'Testimonials',
    category: 'section',
    schema: {
      type: 'object',
      properties: {
        heading: str('Section heading.'),
        headingLevel: HEADING_LEVEL,
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              quote: str('The customer\'s words. Never fabricate a review.'),
              name: str('Who said it.'),
              role: str('Their context, e.g. "Owner-operator".'),
              rating: int('Stars out of five.', { minimum: 1, maximum: 5 }),
            },
            required: ['quote', 'name'],
          },
        },
      },
      required: ['items'],
    },
    render(props) {
      const items = props.items || [];
      if (!items.length) return '';
      const cards = items.map(
        (it) =>
          `<figure class="bz-quote">${stars(it.rating)}<blockquote>${esc(
            it.quote,
          )}</blockquote><figcaption><span class="bz-quote__n">${esc(it.name)}</span>${
            it.role ? `<span class="bz-quote__r">${esc(it.role)}</span>` : ''
          }</figcaption></figure>`,
      );
      return container(
        `${heading(levelOf(props), props.heading)}<div class="bz-grid bz-grid--${Math.min(
          3,
          items.length,
        )}">${join(cards, '')}</div>`,
      );
    },
  },

  logoStrip: {
    label: 'Logo strip',
    category: 'section',
    schema: {
      type: 'object',
      properties: {
        heading: str('Optional label, e.g. "Brands we carry".'),
        headingLevel: HEADING_LEVEL,
        logos: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: str('Brand name.'), image: IMAGE_SCHEMA, url: str('Brand page.') },
            required: ['name'],
          },
        },
      },
      required: ['logos'],
    },
    render(props, ctx) {
      const logos = props.logos || [];
      if (!logos.length) return '';
      const cells = logos.map((l) => {
        const inner =
          l.image && l.image.src
            ? image({ ...l.image, alt: l.image.alt || l.name }, { width: 160, height: 48 })
            : `<span class="bz-logo__t">${esc(l.name)}</span>`;
        return l.url
          ? `<a class="bz-logo" href="${esc(href(l.url, ctx))}"${attrs(
              tagAttrs('link', 'brand'),
            )}>${inner}</a>`
          : `<div class="bz-logo">${inner}</div>`;
      });
      return container(
        `${props.heading ? `<p class="bz-eyebrow bz-center">${esc(props.heading)}</p>` : ''}<div class="bz-logos">${join(
          cells,
          '',
        )}</div>`,
      );
    },
  },

  locationsMap: {
    label: 'Locations + map',
    category: 'section',
    /**
     * The static half is authored; the map half is a widget, because a dealer's
     * locations are platform data and must not be re-typed here. Leave
     * `locations` empty and the Locations widget fills the list at hydration.
     */
    schema: {
      type: 'object',
      properties: {
        heading: str('Section heading.'),
        mapHeading: str('Heading over the map column.'),
        headingLevel: HEADING_LEVEL,
        useLiveLocations: bool(
          "Pull locations from the dealer's Locations module instead of the list below. Prefer this — a hand-typed list goes stale the day a location is added.",
        ),
        locations: {
          type: 'array',
          description: 'Only used when useLiveLocations is false.',
          items: {
            type: 'object',
            properties: {
              city: str('City and region.'),
              services: str('What the site offers, e.g. "Sales · Service · Parts".'),
              url: str('Location page.'),
            },
            required: ['city'],
          },
        },
        testimonial: {
          type: 'object',
          properties: { quote: str('Quote.'), name: str('Name.'), role: str('Role.') },
        },
      },
    },
    render(props, ctx, block) {
      const left = `<div>${heading(levelOf(props), props.heading)}${
        props.testimonial && props.testimonial.quote
          ? `<figure class="bz-quote">${stars(5)}<blockquote>${esc(
              props.testimonial.quote,
            )}</blockquote><figcaption><span class="bz-quote__n">${esc(
              props.testimonial.name || '',
            )}</span>${
              props.testimonial.role
                ? `<span class="bz-quote__r">${esc(props.testimonial.role)}</span>`
                : ''
            }</figcaption></figure>`
          : ''
      }</div>`;
      const right = props.useLiveLocations
        ? renderWidget(
            { widget: 'locations-map', config: { heading: props.mapHeading, showMap: true } },
            ctx,
            block,
          )
        : `<div>${heading(levelOf(props) + 1, props.mapHeading)}<ul class="bz-loclist bz-bare">${join(
            (props.locations || []).map(
              (l) =>
                `<li class="bz-loc">${
                  l.url
                    ? `<a href="${esc(href(l.url, ctx))}"${attrs(
                        tagAttrs('link', 'location'),
                      )}><span class="bz-loc__c">${esc(l.city)}</span></a>`
                    : `<span class="bz-loc__c">${esc(l.city)}</span>`
                }${l.services ? `<span class="bz-loc__s">${esc(l.services)}</span>` : ''}</li>`,
            ),
            '',
          )}</ul></div>`;
      return container(`<div class="bz-split">${left}${right}</div>`);
    },
  },

  footer: {
    label: 'Storefront footer',
    category: 'section',
    schema: {
      type: 'object',
      properties: {
        tagline: str('One line about the business.'),
        legal: str('Copyright / legal line.'),
        columns: {
          type: 'array',
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              heading: str('Column heading.'),
              links: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { label: str('Link text.'), url: str('Destination.') },
                  required: ['label', 'url'],
                },
              },
            },
            required: ['heading', 'links'],
          },
        },
      },
    },
    render(props, ctx) {
      const cols = (props.columns || []).map(
        (c) =>
          `<div class="bz-fcol"><p class="bz-fcol__h">${esc(c.heading)}</p><ul class="bz-bare">${join(
            (c.links || []).map(
              (l) =>
                `<li><a href="${esc(href(l.url, ctx))}"${attrs(
                  tagAttrs('link', 'footer-nav'),
                )}>${esc(l.label)}</a></li>`,
            ),
            '',
          )}</ul></div>`,
      );
      return container(
        `<div class="bz-footerblock"><div class="bz-fbrand"><p class="bz-fbrand__n">${esc(
          (ctx && ctx.businessName) || '',
        )}</p>${props.tagline ? `<p class="bz-fbrand__t">${esc(props.tagline)}</p>` : ''}</div>${join(
          cols,
          '',
        )}</div>${props.legal ? `<p class="bz-flegal">${esc(props.legal)}</p>` : ''}`,
      );
    },
  },
};

/* -------------------------------------------------------------- small parts */

function stars(rating) {
  const n = Math.min(5, Math.max(1, Number(rating) || 5));
  return `<p class="bz-stars" aria-label="${n} out of 5">${'★'.repeat(n)}</p>`;
}

/**
 * Allow the small inline vocabulary a text block needs and drop everything
 * else. Text blocks come from the AI and from paste, so a permissive path here
 * would be the one hole in the sanitizer the plugin applies on the way in.
 */
const INLINE_ALLOWED = /^<\/?(?:strong|b|em|i|br|a|small)(?:\s[^<>]*)?>$/i;

function inlineHtml(text, ctx) {
  return String(text).replace(/<[^>]*>|[&<>]/g, (m) => {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (!INLINE_ALLOWED.test(m)) return '';
    if (/^<a\s/i.test(m)) {
      const url = (m.match(/href\s*=\s*["']([^"']*)["']/i) || [])[1] || '#';
      return `<a href="${esc(href(url, ctx))}"${
        isExternal(url) ? ' rel="noopener"' : ''
      }${attrs(tagAttrs('link', 'body-link'))}>`;
    }
    return m.toLowerCase();
  });
}

/** Strip the document shell, scripts and inline handlers from a custom fragment. */
function stripUnsafe(html) {
  return String(html || '')
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

/* ----------------------------------------------------------------- registry */

/** Block ids that may sit inside a row column or a bar cell. */
export const CONTENT_BLOCK_TYPES = Object.entries(BLOCKS)
  .filter(([, def]) => ['content', 'widget', 'chrome'].includes(def.category))
  .map(([id]) => id);

/** Block ids a header or footer template is built from. */
export const CHROME_BLOCK_TYPES = Object.entries(BLOCKS)
  .filter(([, def]) => def.category === 'chrome')
  .map(([id]) => id);

/** Block ids that are always full-width and top-level. */
export const SECTION_BLOCK_TYPES = Object.entries(BLOCKS)
  .filter(([, def]) => def.category === 'section')
  .map(([id]) => id);

export const LAYOUT_BLOCK_TYPES = Object.entries(BLOCKS)
  .filter(([, def]) => def.category === 'layout')
  .map(([id]) => id);

/**
 * The public registry: block id → { render, schema, label, category, autoTagged }.
 * `autoTagged` is false only for `customHtml`; the editor marks those blocks and
 * the build warns, because the platform cannot vouch for their tagging.
 */
export const blockRegistry = Object.fromEntries(
  Object.entries(BLOCKS).map(([id, def]) => [
    id,
    {
      id,
      label: def.label,
      category: def.category,
      autoTagged: def.autoTagged !== false,
      schema: def.schema,
      render: def.render,
    },
  ]),
);

export function getBlock(type) {
  return blockRegistry[type] || null;
}

/** Machine-readable catalogue for the AI contract and the editor's inspector. */
export function blockCatalogue() {
  return Object.values(blockRegistry).map((b) => ({
    id: b.id,
    label: b.label,
    category: b.category,
    autoTagged: b.autoTagged,
    schema: b.schema,
  }));
}
