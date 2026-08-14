import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOps,
  blockRegistry,
  compileTokens,
  compileTokenScope,
  injectMenus,
  renderForm,
  renderPage,
  resolveTemplates,
  validatePage,
} from './index.mjs';

import tokens from '../site/tokens.json' with { type: 'json' };
import menus from '../site/menus.json' with { type: 'json' };

const CTX = {
  storefrontPrefix: 'store',
  businessName: 'Test Dealer',
  buttons: {
    'get-quote': { id: 'get-quote', label: 'Get a quote', url: '/quote', style: 'primary', intent: 'get-quote' },
  },
  forms: {
    contact: {
      id: 'contact',
      name: 'Contact',
      status: 'live',
      fields: [
        { id: 'name', type: 'full_name', label: 'Full name', required: true },
        { id: 'email', type: 'email', label: 'Email', required: true },
        {
          id: 'detail',
          type: 'paragraph',
          label: 'Detail',
          logic: { logic: 'AND', action: 'show', rules: [{ fieldId: 'name', operator: 'is_not_empty' }] },
        },
      ],
    },
  },
};

/* ---------------------------------------------------------------- tokens */

test('compileTokens keeps the v1 back-compat aliases live page CSS depends on', () => {
  const css = compileTokens(tokens);
  for (const alias of ['--primary:', '--bg:', '--surface:', '--border:', '--radius-full:']) {
    assert.ok(css.includes(alias), `missing alias ${alias}`);
  }
  assert.ok(css.includes(`--accent:${tokens.colors.accent}`));
});

test('a scoped override may not introduce a token key', () => {
  const { css, unknown } = compileTokenScope(
    'kenworth',
    { colors: { accent: '#c8102e', neon: '#0f0' } },
    tokens,
  );
  assert.ok(css.startsWith('[data-bz-tokens="kenworth"]'));
  assert.ok(css.includes('--accent:#c8102e'));
  assert.ok(!css.includes('neon'));
  assert.deepEqual(unknown, ['colors.neon']);
});

/* ---------------------------------------------------------------- blocks */

// Example instances, one per block, used to prove the whole registry renders and
// that tagging is structural rather than something the caller remembers to add.
const EXAMPLES = {
  heading: { text: 'Heading' },
  text: { text: 'One paragraph.' },
  image: { image: { src: '/a.jpg', alt: 'A truck', width: 800, height: 600 } },
  buttons: { items: [{ ctaId: 'get-quote' }] },
  list: { items: [{ label: 'One', desc: 'First' }] },
  customHtml: { html: '<p>raw</p>' },
  form: { formId: 'contact' },
  widget: { widget: 'locations-map', config: {}, snapshot: { locations: [{ name: 'Red Deer', phone: '555' }] } },
  row: {
    columns: [
      [{ id: 'c1', type: 'text', props: { text: 'Left' } }],
      [{ id: 'c2', type: 'buttons', props: { items: [{ ctaId: 'get-quote' }] } }],
    ],
  },
  spacer: { size: 4 },
  divider: {},
  hero: { headline: 'Hero', ctas: [{ ctaId: 'get-quote' }], headingLevel: 1 },
  splitHero: { headline: 'Split', ctas: [{ ctaId: 'get-quote' }], stats: [{ value: '4', label: 'Sites' }] },
  iconGrid: { items: [{ label: 'Parts', desc: 'In stock', url: '/parts' }, { label: 'Service', url: '/service' }] },
  categoryGrid: { items: [{ label: 'Trucks', url: '/store' }, { label: 'Trailers', url: '/store' }] },
  statBand: { heading: 'Band', stats: [{ value: '39', label: 'Years' }], ctas: [{ ctaId: 'get-quote' }] },
  serviceGrid: { items: [{ label: 'Parts', desc: 'Counter', cta: { ctaId: 'get-quote' } }, { label: 'Service' }] },
  testimonials: { items: [{ quote: 'Good', name: 'Dale', rating: 5 }] },
  logoStrip: { logos: [{ name: 'Dexter', url: '/brands/dexter' }] },
  locationsMap: { heading: 'Where', locations: [{ city: 'Red Deer', url: '/locations/red-deer' }] },
  footer: { tagline: 'Trailers', columns: [{ heading: 'Shop', links: [{ label: 'Parts', url: '/parts' }] }] },
};

test('every registered block has an example and renders from it', () => {
  for (const id of Object.keys(blockRegistry)) {
    assert.ok(EXAMPLES[id], `block "${id}" has no example in the spec`);
    const html = renderPage({ blocks: [{ id: `b-${id}`, type: id, props: EXAMPLES[id] }] }, CTX);
    if (id === 'spacer' || id === 'divider') continue;
    assert.ok(html.includes(`data-bz-block-type="${id}"`), `block "${id}" rendered nothing`);
  }
});

test('every interactive element a block emits carries data-bz-el', () => {
  for (const [id, props] of Object.entries(EXAMPLES)) {
    if (id === 'customHtml') continue; // the documented escape hatch: not auto-tagged
    const html = renderPage({ blocks: [{ id: `b-${id}`, type: id, props }] }, CTX);
    const interactive = html.match(/<(?:a|button|form)\s[^>]*>/g) || [];
    for (const el of interactive) {
      assert.ok(el.includes('data-bz-el='), `${id} emitted an untagged element: ${el}`);
    }
  }
});

test('a section block inside a column is refused, not rendered', () => {
  const warnings = [];
  const html = renderPage(
    {
      blocks: [
        {
          id: 'r',
          type: 'row',
          props: {
            columns: [
              [{ id: 'bad', type: 'hero', props: { headline: 'Nope' } }],
              [{ id: 'ok', type: 'text', props: { text: 'Fine' } }],
            ],
          },
        },
      ],
    },
    { ...CTX, warn: (m) => warnings.push(m) },
  );
  assert.ok(!html.includes('data-bz-block="bad"'));
  assert.ok(html.includes('data-bz-block="ok"'));
  assert.match(warnings.join(' '), /cannot sit inside a column/);
});

test('an unknown block warns and disappears rather than failing the build', () => {
  const warnings = [];
  const html = renderPage(
    { blocks: [{ id: 'x', type: 'nope', props: {} }, { id: 'y', type: 'text', props: { text: 'Kept' } }] },
    { ...CTX, warn: (m) => warnings.push(m) },
  );
  assert.ok(html.includes('Kept'));
  assert.match(warnings.join(' '), /Unknown block type "nope"/);
});

test('customHtml drops scripts and inline handlers but keeps content', () => {
  const html = renderPage(
    {
      blocks: [
        {
          id: 'c',
          type: 'customHtml',
          props: { html: '<p onclick="steal()">Hi</p><script>bad()</script>' },
        },
      ],
    },
    CTX,
  );
  assert.ok(html.includes('<p>Hi</p>'));
  assert.ok(!html.includes('script'));
  assert.ok(!html.includes('onclick'));
});

test('a text block keeps its inline links but strips everything else', () => {
  const html = renderPage(
    {
      blocks: [
        {
          id: 't',
          type: 'text',
          props: { text: 'See <a href="/about">about</a> and <span class="x">no</span>.' },
        },
      ],
    },
    CTX,
  );
  assert.ok(html.includes('<a href="/about"'));
  assert.ok(html.includes('data-bz-intent="body-link"'));
  assert.ok(!html.includes('<span'));
});

/* -------------------------------------------------------- library resolution */

test('a CTA resolves label, destination and intent from the Buttons library', () => {
  const html = renderPage({ blocks: [{ id: 'b', type: 'buttons', props: { items: [{ ctaId: 'get-quote' }] } }] }, CTX);
  assert.ok(html.includes('href="/quote"'));
  assert.ok(html.includes('data-bz-intent="get-quote"'));
  assert.ok(html.includes('data-bz-cta="get-quote"'));
});

test('an unknown CTA id warns instead of rendering a dead button', () => {
  const warnings = [];
  renderPage({ blocks: [{ id: 'b', type: 'buttons', props: { items: [{ ctaId: 'ghost', label: 'X' }] } }] }, {
    ...CTX,
    warn: (m) => warnings.push(m),
  });
  assert.match(warnings.join(' '), /"ghost" is not in site\/buttons\.json/);
});

test('a form renders from the library with logic and a same-origin action', () => {
  const html = renderForm(CTX.forms.contact, CTX);
  assert.ok(html.includes('action="/store/forms/contact"'));
  assert.ok(html.includes('data-bz-logic='));
  assert.ok(html.includes('name="_hp"'), 'honeypot missing');
  assert.ok(html.includes('data-bz-el="form"'));
});

test('a draft form is not rendered on a published page', () => {
  const warnings = [];
  const html = renderForm({ ...CTX.forms.contact, status: 'draft' }, { ...CTX, warn: (m) => warnings.push(m) });
  assert.equal(html, '');
  assert.match(warnings.join(' '), /is a draft/);
});

test('a widget carries its config for hydration and its snapshot in the markup', () => {
  const html = renderPage(
    {
      blocks: [
        {
          id: 'w',
          type: 'widget',
          props: {
            widget: 'locations-map',
            config: { heading: 'Find us' },
            snapshot: { locations: [{ name: 'Red Deer', streetAddress: '1 Fleet Rd', phone: '555-0100' }] },
          },
        },
      ],
    },
    CTX,
  );
  // The facts are in the served HTML, not fetched: useful without JS, and
  // extractable by an answer engine.
  assert.ok(html.includes('1 Fleet Rd'));
  assert.ok(html.includes('data-bz-hydrate'));
  assert.ok(html.includes('data-bz-intent="call-location"'));
});

/* ------------------------------------------------------------------ menus */

test('injectMenus replaces markers and never hand-writes nav into chrome', () => {
  const html = injectMenus('<nav><!-- menu:desktop-main --></nav>', menus, {});
  assert.ok(html.includes('data-bz-menu-item="desktop-main"'));
  assert.ok(!html.includes('<!-- menu:'));
});

test('an unknown menu location warns rather than rendering an empty nav silently', () => {
  const warnings = [];
  injectMenus('<!-- menu:nope -->', menus, { warn: (m) => warnings.push(m) });
  assert.match(warnings.join(' '), /no location "nope"/);
});

/* -------------------------------------------------------------- validation */

test('validatePage reports the specific field a model got wrong', () => {
  const result = validatePage({
    blocks: [{ id: 'h', type: 'hero', props: { headingLevel: 9 } }],
  });
  assert.equal(result.valid, false);
  assert.match(result.message, /headline: is required/);
  assert.match(result.message, /headingLevel: must be <= 6/);
});

test('validatePage catches duplicate ids, which would break every later patch', () => {
  const result = validatePage({
    blocks: [
      { id: 'same', type: 'text', props: { text: 'a' } },
      { id: 'same', type: 'text', props: { text: 'b' } },
    ],
  });
  assert.equal(result.valid, false);
  assert.match(result.message, /duplicate block id "same"/);
});

test('an unknown prop is a warning, not a failure — a newer editor must not break the build', () => {
  const result = validatePage({ blocks: [{ id: 't', type: 'text', props: { text: 'a', future: 1 } }] });
  assert.equal(result.valid, true);
  assert.equal(result.warnings.length, 1);
});

/* --------------------------------------------------------------------- ops */

const PAGE = {
  blocks: [
    { id: 'hero', type: 'hero', props: { headline: 'Old', subhead: 'Keep me', headingLevel: 1 } },
    {
      id: 'row',
      type: 'row',
      props: { columns: [[{ id: 'left', type: 'text', props: { text: 'L' } }], []] },
    },
  ],
};

test('an update patches only the named fields and leaves every other block identical', () => {
  const before = JSON.stringify(PAGE.blocks[1]);
  const { page, rejected } = applyOps(PAGE, [{ op: 'update', id: 'hero', patch: { headline: 'New' } }]);
  assert.deepEqual(rejected, []);
  assert.equal(page.blocks[0].props.headline, 'New');
  assert.equal(page.blocks[0].props.subhead, 'Keep me', 'unmentioned field was dropped');
  assert.equal(JSON.stringify(page.blocks[1]), before, 'an unrelated block changed');
});

test('ops reach blocks nested inside a row column', () => {
  const { page } = applyOps(PAGE, [{ op: 'update', id: 'left', patch: { text: 'Updated' } }]);
  assert.equal(page.blocks[1].props.columns[0][0].props.text, 'Updated');
});

test('addToColumn places a block in the right column', () => {
  const { page, rejected } = applyOps(PAGE, [
    { op: 'addToColumn', rowId: 'row', columnIndex: 1, block: { id: 'right', type: 'text', props: { text: 'R' } } },
  ]);
  assert.deepEqual(rejected, []);
  assert.equal(page.blocks[1].props.columns[1][0].id, 'right');
});

test('an op naming a block that does not exist is rejected and reported', () => {
  const { page, rejected } = applyOps(PAGE, [{ op: 'update', id: 'ghost', patch: { text: 'x' } }]);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, /not found/);
  assert.equal(page.blocks.length, 2);
});

test('a duplicate id is refused so later patches keep addressing one block', () => {
  const { rejected } = applyOps(PAGE, [
    { op: 'add', block: { id: 'hero', type: 'text', props: { text: 'x' } }, afterId: null },
  ]);
  assert.match(rejected[0].reason, /already exists/);
});

test('setting a prop to null removes it', () => {
  const { page } = applyOps(PAGE, [{ op: 'update', id: 'hero', patch: { subhead: null } }]);
  assert.equal('subhead' in page.blocks[0].props, false);
});

/* --------------------------------------------------------------- templates */

test('resolution order is page override, then condition, then channel default', () => {
  const assignments = {
    defaults: { header: 'header--main' },
    rules: [
      { slot: 'header', templateId: 'header--brand', condition: { type: 'group', group: 'brand' } },
      { slot: 'header', templateId: 'header--exact', condition: { type: 'route', pattern: '/brands/*' } },
    ],
  };
  const byDefault = resolveTemplates({ route: '/about', kind: 'page' }, null, assignments);
  assert.equal(byDefault.header.templateId, 'header--main');
  assert.equal(byDefault.header.rule, 'channelDefault');

  const byGroup = resolveTemplates({ route: '/x', kind: 'page', group: 'brand' }, null, assignments);
  assert.equal(byGroup.header.templateId, 'header--brand');

  // A route pattern is more specific than a page group, so it wins outright.
  const byRoute = resolveTemplates({ route: '/brands/kenworth', kind: 'page', group: 'brand' }, null, assignments);
  assert.equal(byRoute.header.templateId, 'header--exact');
  assert.match(byRoute.header.ruleLabel, /route pattern/);

  const byPage = resolveTemplates(
    { route: '/brands/kenworth', kind: 'page', group: 'brand' },
    { templates: { header: 'header--one-off' } },
    assignments,
  );
  assert.equal(byPage.header.templateId, 'header--one-off');
  assert.equal(byPage.header.rule, 'page');
});

test('two equally specific rules are reported as a conflict, never silently picked', () => {
  const resolved = resolveTemplates({ route: '/a', kind: 'page' }, null, {
    defaults: {},
    rules: [
      { slot: 'footer', templateId: 'footer--one', condition: { type: 'all' } },
      { slot: 'footer', templateId: 'footer--two', condition: { type: 'all' } },
    ],
  });
  assert.ok(resolved.footer.conflict, 'a tie was resolved silently');
});

test('a slot with no rule at all still resolves — chrome is never missing', () => {
  const resolved = resolveTemplates({ route: '/a', kind: 'page' }, null, {});
  assert.equal(resolved.header.templateId, 'header--default');
  assert.equal(resolved.header.rule, 'rendererDefault');
});
