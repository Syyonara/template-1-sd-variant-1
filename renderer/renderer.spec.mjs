import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOps,
  blockCatalogue,
  blockRegistry,
  clearCustomWidgets,
  customWidgetCss,
  customWidgets,
  parseWidgetDefinition,
  registerCustomWidgets,
  compileTokens,
  compileTokenScope,
  injectMenus,
  renderForm,
  renderPage,
  renderMenu,
  resolveTemplates,
  SLOTS,
  validatePage,
} from './index.mjs';

import tokens from '../site/tokens.json' with { type: 'json' };
import menus from '../site/menus.json' with { type: 'json' };

const CTX = {
  storefrontPrefix: 'store',
  businessName: 'Test Dealer',
  menus,
  pages: [{ slug: 'about', path: '/about', title: 'About', status: 'published' }],
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
  logo: { text: 'Test Dealer', url: '/' },
  menu: { location: 'primary' },
  bar: {
    columns: [
      [{ id: 'bar-logo', type: 'logo', props: { text: 'Test Dealer' } }],
      [{ id: 'bar-menu', type: 'menu', props: { location: 'primary' } }],
    ],
  },
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

test('injectMenus replaces markers with whatever is assigned to that location', () => {
  const html = injectMenus('<nav><!-- menu:primary --></nav>', menus, {});
  assert.ok(html.includes('data-bz-menu-item="primary"'));
  assert.ok(!html.includes('<!-- menu:'));
});

test('a location with no menu assigned renders nothing and does not warn', () => {
  // An unassigned location is a normal state during setup. Warning on it would
  // train people to ignore the warnings that do matter.
  const warnings = [];
  const html = injectMenus('<!-- menu:nope -->', menus, { warn: (m) => warnings.push(m) });
  assert.equal(html.trim(), '');
  assert.deepEqual(warnings, []);
});

test('a v1 menus file still renders, as one menu per old location', () => {
  const v1 = {
    'desktop-main': { label: 'Desktop main', items: [{ label: 'Home', href: '/' }] },
  };
  const html = renderMenu(v1, 'primary', {});
  assert.ok(html.includes('>Home</a>'), 'v1 desktop-main did not map onto primary');
});

test('a page item follows the page, so renaming its address does not orphan the link', () => {
  const v2 = {
    version: 2,
    menus: { main: { id: 'main', name: 'Main', items: [{ id: 'a', label: 'About', type: 'page', ref: 'about' }] } },
    locations: { primary: 'main' },
  };
  const html = renderMenu(v2, 'primary', { pages: [{ slug: 'about', path: '/company', title: 'About', status: 'published' }] });
  assert.ok(html.includes('href="/company"'));
});

test('a menu item pointing at a deleted page warns instead of linking nowhere', () => {
  const warnings = [];
  const v2 = {
    version: 2,
    menus: { main: { id: 'main', name: 'Main', items: [{ id: 'a', label: 'Gone', type: 'page', ref: 'gone' }] } },
    locations: { primary: 'main' },
  };
  renderMenu(v2, 'primary', { pages: [], warn: (m) => warnings.push(m) });
  assert.match(warnings.join(' '), /no longer exists/);
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
  assert.match(byRoute.header.ruleLabel, /pages matching/);

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
  assert.equal(resolved.header.rule, 'starter');
});

test('there are two site parts, not four', () => {
  // utilityNav and siteFooter were slots; they are rows inside a header or footer
  // template now, which is what lets a dealer put a utility bar below the nav.
  assert.deepEqual(SLOTS, ['header', 'footer']);
});

/* ------------------------------------------------------------ custom widgets */

const SPEC_STRIP = {
  id: 'spec-strip',
  label: 'Spec strip',
  category: 'content',
  props: [
    { key: 'heading', type: 'text', label: 'Heading', required: true },
    { key: 'note', type: 'richtext', label: 'Note' },
    {
      key: 'items',
      type: 'list',
      label: 'Specs',
      fields: [
        { key: 'name', type: 'text', label: 'Name' },
        { key: 'value', type: 'text', label: 'Value' },
      ],
    },
  ],
  html:
    '<div class="strip"><h3>{{heading}}</h3>{{#if note}}<p class="note">{{&note}}</p>{{/if}}' +
    '<ul>{{#each items}}<li data-i="{{@index}}"><b>{{name}}</b> {{value}}</li>{{/each}}</ul></div>',
  css: '.strip{display:flex} .note{color:var(--muted)} @media (max-width:600px){.strip{display:block}}',
};

test('a custom widget renders as an ordinary block once registered', () => {
  registerCustomWidgets([SPEC_STRIP]);
  const html = renderPage(
    {
      blocks: [
        {
          id: 's1',
          type: 'spec-strip',
          props: {
            heading: 'Specs',
            note: 'Ask about <strong>towing</strong>',
            items: [{ name: 'GVWR', value: '14k' }],
          },
        },
      ],
    },
    CTX,
  );
  assert.match(html, /data-bz-block-type="spec-strip"/);
  assert.match(html, /<h3>Specs<\/h3>/);
  assert.match(html, /<b>GVWR<\/b> 14k/);
  assert.match(html, /data-i="0"/);
  // richtext keeps the inline vocabulary and nothing else
  assert.match(html, /Ask about <strong>towing<\/strong>/);
  clearCustomWidgets();
});

test('interpolation is escaped, and rich text cannot smuggle a script', () => {
  registerCustomWidgets([SPEC_STRIP]);
  const html = renderPage(
    {
      blocks: [
        {
          id: 's1',
          type: 'spec-strip',
          props: { heading: '<img src=x onerror=alert(1)>', note: '<script>alert(1)</script>ok' },
        },
      ],
    },
    CTX,
  );
  assert.ok(!html.includes('<img src=x'), 'a prop value was interpolated as markup');
  assert.ok(!html.toLowerCase().includes('<script'), 'rich text let a script through');
  assert.match(html, /ok/);
  clearCustomWidgets();
});

test('a widget definition that declares a slot accepts nested blocks', () => {
  registerCustomWidgets([
    {
      id: 'panel',
      label: 'Panel',
      props: [{ key: 'title', type: 'text', label: 'Title' }],
      html: '<div class="panel"><h4>{{title}}</h4><div class="body" data-bz-slot="0"></div></div>',
    },
  ]);
  const html = renderPage(
    {
      blocks: [
        {
          id: 'p1',
          type: 'panel',
          props: { title: 'Inside', columns: [[{ id: 't1', type: 'text', props: { text: 'Nested copy' } }]] },
        },
      ],
    },
    CTX,
  );
  assert.match(html, /data-bz-slot="0"/);
  assert.match(html, /Nested copy/);
  clearCustomWidgets();
});

test('widget CSS is scoped to the widget, including inside a media query', () => {
  registerCustomWidgets([SPEC_STRIP]);
  const css = customWidgetCss();
  assert.match(css, /\.bz-block--spec-strip \.strip\{/);
  assert.match(css, /@media \(max-width:600px\)\{\.bz-block--spec-strip \.strip\{/);
  assert.ok(!/^\.strip\{/m.test(css), 'an unscoped selector escaped the widget');
  clearCustomWidgets();
});

test('a widget cannot shadow a built-in block', () => {
  const warnings = [];
  const ids = registerCustomWidgets([{ id: 'hero', label: 'Fake hero', html: '<p>no</p>' }], (m) =>
    warnings.push(m),
  );
  assert.deepEqual(ids, []);
  assert.match(warnings.join(' '), /shadows a built-in block/);
  assert.equal(blockRegistry.hero.label, 'Hero (full-bleed)');
  clearCustomWidgets();
});

test('a definition is rejected rather than half-registered', () => {
  const bad = parseWidgetDefinition({ id: 'Bad Id', html: '' });
  assert.equal(bad.definition, null);
  assert.ok(bad.errors.some((e) => e.includes('id')));
  assert.ok(bad.errors.some((e) => e.includes('html is required')));

  const unbalanced = parseWidgetDefinition({ id: 'unbalanced', html: '<p>{{#if a}}x</p>' });
  assert.equal(unbalanced.definition, null);
  assert.match(unbalanced.errors.join(' '), /not closed/);
});

test('scripts and handlers are stripped when the definition is parsed', () => {
  const { definition } = parseWidgetDefinition({
    id: 'clean',
    html: '<div onclick="steal()"><script>bad()</script><a href="javascript:x">go</a></div>',
    css: '@import url(http://evil.example/x.css); .a{color:red}',
  });
  assert.ok(definition, 'a definition that is safe after stripping should survive');
  assert.ok(!definition.html.includes('onclick'));
  assert.ok(!definition.html.toLowerCase().includes('<script'));
  assert.ok(!definition.html.includes('javascript:'));
  assert.ok(!definition.css.includes('@import'));
});

test('a widget schema validates its instances like any other block', () => {
  registerCustomWidgets([SPEC_STRIP]);
  const bad = validatePage({ blocks: [{ id: 's1', type: 'spec-strip', props: { items: 'not a list' } }] });
  assert.equal(bad.valid, false);
  assert.match(bad.message, /heading: is required/);
  assert.match(bad.message, /expected array/);

  const good = validatePage({
    blocks: [{ id: 's1', type: 'spec-strip', props: { heading: 'Specs', items: [] } }],
  });
  assert.equal(good.valid, true, good.message);
  clearCustomWidgets();
});

test('an untagged link in a widget is reported, not blocked', () => {
  const tagged = parseWidgetDefinition({
    id: 'tagged',
    html: '<a href="/x" data-bz-el="cta" data-bz-intent="quote">Go</a>',
  });
  assert.equal(tagged.definition.autoTagged, true);
  const untagged = parseWidgetDefinition({ id: 'untagged', html: '<a href="/x">Go</a>' });
  assert.equal(untagged.definition.autoTagged, false);
});

test('registering replaces the previous set rather than merging', () => {
  registerCustomWidgets([SPEC_STRIP]);
  registerCustomWidgets([{ id: 'other', label: 'Other', html: '<p>x</p>' }]);
  assert.deepEqual(customWidgets().map((w) => w.id), ['other']);
  clearCustomWidgets();
});

test('the catalogue exposes custom widgets under their own category', () => {
  registerCustomWidgets([SPEC_STRIP]);
  const entry = blockCatalogue().find((b) => b.id === 'spec-strip');
  assert.equal(entry.category, 'custom');
  assert.equal(entry.placement, 'content');
  assert.equal(entry.custom, true);
  assert.ok(entry.schema.properties.heading);
  clearCustomWidgets();
});
