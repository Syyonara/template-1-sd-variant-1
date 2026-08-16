import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  accepts,
  applyOps,
  blockCatalogue,
  blockRegistry,
  clearCustomWidgets,
  compileNodeStyles,
  compileTokens,
  compileTokenScope,
  composeDocument,
  conditionMatches,
  customWidgetCss,
  customWidgets,
  ensureIds,
  findContentArea,
  makeRow,
  makeSection,
  parseDocument,
  parseMenus,
  parseTemplates,
  parseWidgetDefinition,
  registerCustomWidgets,
  renderDocument,
  renderForm,
  renderMenu,
  resolveTemplate,
  splitAtContentArea,
  unknownStyleKeys,
  validateDocument,
  validateTemplate,
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
      fields: [{ id: 'name', type: 'text', label: 'Name', required: true }],
    },
  },
};

/* ------------------------------------------------------------- the document */

test('a page is a tree: section holds a row, a row holds columns, columns hold widgets', () => {
  const doc = {
    nodes: [
      {
        id: 's1',
        type: 'section',
        props: { width: 'boxed' },
        children: [
          {
            id: 'r1',
            type: 'row',
            props: { gap: 6 },
            children: [
              {
                id: 'c1',
                type: 'column',
                props: { span: 8 },
                children: [{ id: 'h1', type: 'heading', props: { text: 'Left' } }],
              },
              {
                id: 'c2',
                type: 'column',
                props: { span: 4 },
                children: [{ id: 't1', type: 'text', props: { text: 'Right' } }],
              },
            ],
          },
        ],
      },
    ],
  };
  const html = renderDocument(doc, CTX);
  assert.match(html, /data-bz-type="section"/);
  assert.match(html, /data-bz-type="row"/);
  assert.match(html, /--bz-span:8/);
  assert.match(html, /--bz-span:4/);
  assert.match(html, /Left/);
  assert.match(html, /Right/);
});

test('nesting rules are one predicate, and it is the one the editor uses', () => {
  assert.equal(accepts('row', 'column'), true);
  assert.equal(accepts('row', 'heading'), false, 'a widget cannot sit directly in a row');
  assert.equal(accepts('column', 'row'), true, 'a nested grid must be possible');
  assert.equal(accepts('column', 'heading'), true);
  assert.equal(accepts('section', 'column'), false, 'a column needs a row to sit in');
  assert.equal(accepts('section', 'row'), true);
  assert.equal(accepts(null, 'column'), false, 'a bare column has no grid');
  assert.equal(accepts(null, 'section'), true);
  assert.equal(accepts('heading', 'text'), false, 'a widget is a leaf');
});

test('a v1 page migrates: a row that carried props.columns becomes real columns', () => {
  const v1 = {
    version: 1,
    blocks: [
      { id: 'hero', type: 'hero', props: { headline: 'Hi' } },
      {
        id: 'r1',
        type: 'row',
        props: {
          align: 'center',
          columns: [
            [{ id: 'h1', type: 'heading', props: { text: 'Left' } }],
            [{ id: 't1', type: 'text', props: { text: 'Right' } }],
          ],
        },
      },
    ],
  };
  const doc = parseDocument(v1);
  const row = doc.nodes[1];
  assert.equal(row.type, 'row');
  assert.equal(row.children.length, 2);
  assert.equal(row.children[0].type, 'column');
  assert.equal(row.children[0].props.span, 6);
  assert.equal(row.children[0].children[0].id, 'h1');
  assert.ok(!('columns' in row.props), 'the old children prop must not survive');
});

test('a v1 bar becomes a row, so a migrated header is editable as a grid', () => {
  const doc = parseDocument({
    blocks: [
      {
        id: 'bar',
        type: 'bar',
        props: { columns: [[{ id: 'logo', type: 'logo', props: {} }], [{ id: 'nav', type: 'menu', props: {} }]] },
      },
    ],
  });
  assert.equal(doc.nodes[0].type, 'row');
  assert.equal(doc.nodes[0].children.length, 2);
});

test('ids are stamped without renaming ones that already exist', () => {
  const nodes = [{ type: 'section', children: [{ id: 'keep', type: 'heading', props: {} }] }];
  ensureIds(nodes);
  assert.equal(nodes[0].id, 'section');
  assert.equal(nodes[0].children[0].id, 'keep');
});

test('makeRow builds a grid that sums to the twelve-column track', () => {
  const row = makeRow([8, 4]);
  assert.equal(row.children.length, 2);
  assert.deepEqual(row.children.map((c) => c.props.span), [8, 4]);
  assert.ok(row.children.every((c) => c.type === 'column'));
});

/* ------------------------------------------------------------------- ops */

test('insert places a node inside a named parent at a named index', () => {
  const doc = { nodes: [makeSection([makeRow([6, 6])])] };
  ensureIds(doc.nodes);
  const columnId = doc.nodes[0].children[0].children[1].id;

  const { document, rejected } = applyOps(doc, [
    { op: 'insert', parentId: columnId, index: 0, node: { id: 'h', type: 'heading', props: { text: 'Hi' } } },
  ]);
  assert.deepEqual(rejected, []);
  assert.equal(document.nodes[0].children[0].children[1].children[0].id, 'h');
});

test('insert refuses a placement the editor would also refuse', () => {
  const doc = { nodes: [makeRow([6, 6])] };
  ensureIds(doc.nodes);
  const { rejected } = applyOps(doc, [
    { op: 'insert', parentId: doc.nodes[0].id, node: { id: 'h', type: 'heading', props: {} } },
  ]);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, /cannot go inside a row/);
});

test('move reparents — dragging a widget from one column into another', () => {
  const doc = {
    nodes: [
      {
        id: 'r',
        type: 'row',
        props: {},
        children: [
          { id: 'c1', type: 'column', props: { span: 6 }, children: [{ id: 'h', type: 'heading', props: {} }] },
          { id: 'c2', type: 'column', props: { span: 6 }, children: [] },
        ],
      },
    ],
  };
  const { document, rejected } = applyOps(doc, [{ op: 'move', id: 'h', parentId: 'c2', index: 0 }]);
  assert.deepEqual(rejected, []);
  assert.equal(document.nodes[0].children[0].children.length, 0);
  assert.equal(document.nodes[0].children[1].children[0].id, 'h');
});

test('move within one parent honours the index the caller meant', () => {
  const doc = {
    nodes: [
      { id: 'a', type: 'heading', props: {} },
      { id: 'b', type: 'heading', props: {} },
      { id: 'c', type: 'heading', props: {} },
    ],
  };
  const { document } = applyOps(doc, [{ op: 'move', id: 'a', parentId: null, index: 2 }]);
  assert.deepEqual(document.nodes.map((n) => n.id), ['b', 'c', 'a']);
});

test('a node cannot be moved inside itself', () => {
  const doc = { nodes: [makeSection([makeRow([12])])] };
  ensureIds(doc.nodes);
  const sectionId = doc.nodes[0].id;
  const rowId = doc.nodes[0].children[0].id;
  const { rejected } = applyOps(doc, [{ op: 'move', id: sectionId, parentId: rowId }]);
  assert.equal(rejected.length, 1);
});

test('wrap keeps the node — "make this two columns" is not a delete and a re-add', () => {
  const doc = { nodes: [{ id: 'h', type: 'heading', props: { text: 'Keep me' } }] };
  const { document, rejected } = applyOps(doc, [{ op: 'wrap', id: 'h', node: makeRow([6, 6]) }]);
  assert.deepEqual(rejected, []);
  assert.equal(document.nodes[0].type, 'row');
  assert.equal(document.nodes[0].children[0].children[0].id, 'h');
  assert.equal(document.nodes[0].children[0].children[0].props.text, 'Keep me');
});

test('update merges props and leaves everything else byte-identical', () => {
  const doc = { nodes: [{ id: 'h', type: 'heading', props: { text: 'a', align: 'center' } }] };
  const { document } = applyOps(doc, [{ op: 'update', id: 'h', props: { text: 'b' } }]);
  assert.deepEqual(document.nodes[0].props, { text: 'b', align: 'center' });
});

/* ----------------------------------------------------------------- scope */

/** Two columns; the dealer has c1 selected. The failure this guards against is
 * the model "helping" by rebuilding the parts nobody asked about. */
function scopedDoc() {
  return {
    nodes: [
      {
        id: 's',
        type: 'section',
        props: { background: 'card' },
        children: [
          {
            id: 'r',
            type: 'row',
            props: {},
            children: [
              { id: 'c1', type: 'column', props: { span: 6 }, children: [{ id: 'h', type: 'heading', props: {} }] },
              { id: 'c2', type: 'column', props: { span: 6 }, children: [{ id: 'img', type: 'image', props: {} }] },
            ],
          },
        ],
      },
    ],
  };
}

test('scope: "add an FAQ here" with a column selected inserts into it and touches nothing else', () => {
  const { document, rejected } = applyOps(scopedDoc(), [
    { op: 'insert', parentId: 'c1', node: { id: 'faq1', type: 'faq', props: {} } },
  ], { scopeId: 'c1' });
  assert.deepEqual(rejected, []);
  assert.equal(document.nodes[0].children[0].children[0].children[1].id, 'faq1');
});

test('scope: an op on the sibling column is rejected, not applied', () => {
  const before = JSON.stringify(scopedDoc().nodes);
  const { document, rejected } = applyOps(scopedDoc(), [
    { op: 'remove', id: 'c2' },
    { op: 'update', id: 's', props: { background: 'ink' } },
    { op: 'move', id: 'img', parentId: 'c1' },
  ], { scopeId: 'c1' });
  assert.equal(rejected.length, 3);
  assert.ok(rejected.every((r) => /outside the selection/.test(r.reason)));
  assert.equal(JSON.stringify(document.nodes), before);
});

test('scope: updating and wrapping the selected node itself is allowed', () => {
  const { document, rejected } = applyOps(scopedDoc(), [
    { op: 'update', id: 'c1', props: { span: 4 } },
  ], { scopeId: 'c1' });
  assert.deepEqual(rejected, []);
  assert.equal(document.nodes[0].children[0].children[0].props.span, 4);
});

test('scope: insert lands beside the selection but never further out', () => {
  const beside = applyOps(scopedDoc(), [
    { op: 'insert', parentId: 'r', node: { id: 'c3', type: 'column', props: { span: 4 }, children: [] } },
  ], { scopeId: 'c1' });
  assert.deepEqual(beside.rejected, []);

  const farOut = applyOps(scopedDoc(), [
    { op: 'insert', parentId: null, node: { id: 's2', type: 'section', props: {}, children: [] } },
  ], { scopeId: 'c1' });
  assert.equal(farOut.rejected.length, 1);
});

test('scope: a stale selection rejects the whole batch instead of disabling the boundary', () => {
  const before = JSON.stringify(scopedDoc().nodes);
  const { document, rejected } = applyOps(scopedDoc(), [
    { op: 'update', id: 'c1', props: { span: 4 } },
    { op: 'remove', id: 'c2' },
  ], { scopeId: 'gone-node' });
  assert.equal(rejected.length, 2);
  assert.ok(rejected.every((r) => /is not in this document/.test(r.reason)));
  assert.equal(JSON.stringify(document.nodes), before);
});

test('scope: a node inserted in this batch is editable in the same batch', () => {
  const { document, rejected } = applyOps(scopedDoc(), [
    { op: 'insert', parentId: 'c1', node: { id: 'h2', type: 'heading', props: { text: 'a' } } },
    { op: 'update', id: 'h2', props: { text: 'b' } },
  ], { scopeId: 'c1' });
  assert.deepEqual(rejected, []);
  const inserted = document.nodes[0].children[0].children[0].children.find((n) => n.id === 'h2');
  assert.equal(inserted.props.text, 'b');
});

/* ----------------------------------------------------------------- styles */

test('node styles compile to id-keyed rules with desktop-first media buckets', () => {
  const css = compileNodeStyles([
    {
      id: 's1',
      type: 'section',
      props: {},
      styles: {
        base: { background: '#102030', paddingTop: 64 },
        mobile: { paddingTop: 24, textAlign: 'center' },
      },
      children: [
        { id: 'h1', type: 'heading', props: {}, styles: { base: { textColor: 'accent' } } },
      ],
    },
  ]);
  assert.match(css, /\[data-bz-node="s1"\]\[data-bz-node\]\{background:#102030;padding-top:64px\}/);
  assert.match(css, /@media \(max-width: 767px\)\{\[data-bz-node="s1"\]\[data-bz-node\]\{padding-top:24px;text-align:center\}\}/);
  assert.match(css, /\[data-bz-node="h1"\]\[data-bz-node\]\{color:var\(--accent\)\}/);
});

test('style values outside the whitelist are dropped, never emitted', () => {
  const css = compileNodeStyles([
    {
      id: 'x',
      type: 'text',
      props: {},
      styles: {
        base: {
          background: 'url(javascript:alert(1))',
          textAlign: 'justify',
          paddingTop: 99999,
          position: 'fixed',
        },
      },
    },
  ]);
  assert.equal(css, '');
  assert.deepEqual(unknownStyleKeys({ base: { position: 'fixed' }, desktop: {} }), ['base.position', 'desktop']);
});

test('styles survive parseDocument, and update ops patch them per bucket', () => {
  const doc = parseDocument({
    version: 2,
    nodes: [{ id: 'a', type: 'heading', props: { text: 'x' }, styles: { base: { textAlign: 'center' } } }],
  });
  assert.deepEqual(doc.nodes[0].styles, { base: { textAlign: 'center' } });

  const { document, rejected } = applyOps(doc, [
    { op: 'update', id: 'a', styles: { base: { background: '#ffffff' }, mobile: { textAlign: 'left' } } },
  ]);
  assert.deepEqual(rejected, []);
  assert.deepEqual(document.nodes[0].styles, {
    base: { textAlign: 'center', background: '#ffffff' },
    mobile: { textAlign: 'left' },
  });

  const cleared = applyOps(document, [{ op: 'update', id: 'a', styles: { base: { textAlign: null, background: null }, mobile: { textAlign: null } } }]);
  assert.equal(cleared.document.nodes[0].styles, undefined);
});

/* -------------------------------------------------------------- templates */

const TEMPLATE = {
  version: 2,
  id: 'default',
  name: 'Site template',
  conditions: [{ type: 'entireSite', ref: null }],
  nodes: [
    { id: 'head', type: 'section', props: {}, children: [] },
    { id: 'content', type: 'contentArea', props: { label: 'Page content' } },
    { id: 'foot', type: 'section', props: {}, children: [] },
  ],
};

test('a page is composed into its template at the content area', () => {
  const page = [{ id: 'h', type: 'heading', props: { text: 'About us' } }];
  const composed = composeDocument(TEMPLATE.nodes, page);
  assert.deepEqual(composed.map((n) => n.id), ['head', 'h', 'foot']);
});

test('the header and footer fragments are derived from where the content area sits', () => {
  const { before, after, found } = splitAtContentArea(TEMPLATE.nodes);
  assert.equal(found, true);
  assert.deepEqual(before.map((n) => n.id), ['head']);
  assert.deepEqual(after.map((n) => n.id), ['foot']);
});

test('display conditions resolve by specificity, most specific first', () => {
  const templates = [
    { ...TEMPLATE, id: 'site', conditions: [{ type: 'entireSite' }] },
    { ...TEMPLATE, id: 'pages', conditions: [{ type: 'allPages' }] },
    { ...TEMPLATE, id: 'about', conditions: [{ type: 'page', ref: 'about' }] },
  ];
  assert.equal(resolveTemplate({ kind: 'page', slug: 'about' }, templates).template.id, 'about');
  assert.equal(resolveTemplate({ kind: 'page', slug: 'other' }, templates).template.id, 'pages');
  assert.equal(resolveTemplate({ kind: 'post', slug: 'x' }, templates).template.id, 'site');
});

test('the home page is not a special case — it is a page with a condition', () => {
  const templates = [
    { ...TEMPLATE, id: 'site', conditions: [{ type: 'entireSite' }] },
    { ...TEMPLATE, id: 'home', conditions: [{ type: 'page', ref: 'home' }] },
  ];
  assert.equal(resolveTemplate({ kind: 'page', slug: 'home' }, templates).template.id, 'home');
  assert.equal(resolveTemplate({ kind: 'page', slug: 'about' }, templates).template.id, 'site');
});

test('two equally specific conditions are reported, not silently resolved', () => {
  const templates = [
    { ...TEMPLATE, id: 'a', conditions: [{ type: 'allPages' }] },
    { ...TEMPLATE, id: 'b', conditions: [{ type: 'allPages' }] },
  ];
  assert.ok(resolveTemplate({ kind: 'page', slug: 'x' }, templates).conflict);
});

test('condition matching covers every kind a target can be', () => {
  assert.equal(conditionMatches({ type: 'allPosts' }, { kind: 'post', slug: 'a' }), true);
  assert.equal(conditionMatches({ type: 'allPosts' }, { kind: 'page', slug: 'a' }), false);
  assert.equal(conditionMatches({ type: 'blog' }, { kind: 'blog' }), true);
  assert.equal(conditionMatches({ type: 'inventory' }, { kind: 'inventory' }), true);
  assert.equal(
    conditionMatches({ type: 'pageGroup', ref: 'brands' }, { kind: 'page', slug: 'x', group: 'brands' }),
    true,
  );
});

test('a repo written under the two-slot model is folded into one template', () => {
  const templates = parseTemplates({
    'header--default.json': { name: 'Header', slot: 'header', blocks: [{ id: 'bar', type: 'logo', props: {} }] },
    'footer--default.json': { name: 'Footer', slot: 'footer', blocks: [{ id: 'f', type: 'footer', props: {} }] },
  });
  assert.equal(templates.length, 1);
  const ids = templates[0].nodes.map((n) => n.type);
  assert.deepEqual(ids, ['logo', 'contentArea', 'footer']);
  assert.deepEqual(templates[0].conditions, [{ type: 'entireSite', ref: null }]);
});

test('a template is refused unless it has exactly one content area', () => {
  assert.equal(validateTemplate({ nodes: [{ id: 'a', type: 'heading', props: { text: 'x' } }] }).valid, false);
  assert.match(
    validateTemplate({ nodes: [{ id: 'a', type: 'heading', props: { text: 'x' } }] }).message,
    /needs a content area/,
  );
  assert.match(
    validateTemplate({
      nodes: [
        { id: 'a', type: 'contentArea', props: {} },
        { id: 'b', type: 'contentArea', props: {} },
      ],
    }).message,
    /only have one content area/,
  );
  assert.equal(validateTemplate(TEMPLATE).valid, true);
});

test('the content area is found wherever it is put, including inside a column', () => {
  const nodes = [
    {
      id: 'r',
      type: 'row',
      props: {},
      children: [
        { id: 'side', type: 'column', props: { span: 3 }, children: [] },
        {
          id: 'main',
          type: 'column',
          props: { span: 9 },
          children: [{ id: 'ca', type: 'contentArea', props: {} }],
        },
      ],
    },
  ];
  assert.equal(findContentArea(nodes).node.id, 'ca');
  const composed = composeDocument(nodes, [{ id: 'h', type: 'heading', props: { text: 'x' } }]);
  assert.equal(composed[0].children[1].children[0].id, 'h');
});

/* ------------------------------------------------------------------ menus */

test('a menu is structure only — no locations, no styling', () => {
  const parsed = parseMenus(menus);
  assert.ok(Array.isArray(parsed.menus));
  assert.ok(!('locations' in parsed), 'locations were a theme concept and are gone');
  assert.ok(parsed.menus.find((m) => m.id === 'main'));
});

test('a menu renders nested items as a nested list', () => {
  const html = renderMenu(menus, 'main', CTX);
  assert.match(html, /data-bz-menu="main"/);
  assert.match(html, /bz-subnav/);
  assert.match(html, /Our team/);
});

test('an unknown menu renders nothing rather than failing the build', () => {
  const warnings = [];
  assert.equal(renderMenu(menus, 'nope', { ...CTX, warn: (m) => warnings.push(m) }), '');
  assert.match(warnings.join(' '), /No menu called/);
});

test('the v2 locations file still yields its menus', () => {
  const parsed = parseMenus({
    version: 2,
    menus: { main: { id: 'main', name: 'Main', items: [{ id: 'a', label: 'A', type: 'url', url: '/a' }] } },
    locations: { primary: 'main' },
  });
  assert.equal(parsed.menus.length, 1);
  assert.equal(parsed.menus[0].id, 'main');
});

test('a page item resolves through the page manifest, so a slug change follows', () => {
  const html = renderMenu(
    { version: 3, menus: [{ id: 'm', name: 'M', items: [{ id: 'i', label: 'About', type: 'page', ref: 'about' }] }] },
    'm',
    CTX,
  );
  assert.match(html, /href="\/about"/);
});

/* --------------------------------------------------------------- widgets */

test('every widget is a leaf and none of them are layout', () => {
  for (const [id, def] of Object.entries(blockRegistry)) {
    assert.ok(
      !['section', 'row', 'column', 'contentArea'].includes(id),
      `${id} should be a layout node, not a widget`,
    );
    assert.ok(def.group, `${id} has no palette group`);
  }
});

test('a custom widget registers as an ordinary leaf', () => {
  registerCustomWidgets([
    {
      id: 'spec-strip',
      label: 'Spec strip',
      props: [{ key: 'heading', type: 'text', label: 'Heading', required: true }],
      html: '<div class="strip"><h3>{{heading}}</h3></div>',
      css: '.strip{display:flex}',
    },
  ]);
  const html = renderDocument({ nodes: [{ id: 's', type: 'spec-strip', props: { heading: 'Specs' } }] }, CTX);
  assert.match(html, /data-bz-type="spec-strip"/);
  assert.match(html, /<h3>Specs<\/h3>/);
  assert.match(customWidgetCss(), /\.bz-block--spec-strip \.strip\{/);
  assert.equal(customWidgets().length, 1);
  clearCustomWidgets();
});

test('a custom widget that declares a drop target is refused, with the reason', () => {
  const { definition, errors } = parseWidgetDefinition({
    id: 'panel',
    label: 'Panel',
    html: '<div><div data-bz-slot="0"></div></div>',
  });
  assert.equal(definition, null);
  assert.match(errors.join(' '), /Widgets are leaves/);
});

test('the catalogue groups widgets for a palette and never for placement', () => {
  const entry = blockCatalogue().find((b) => b.id === 'heading');
  assert.equal(entry.group, 'basic');
});

/* ------------------------------------------------------------ validation */

test('a widget holding children is rejected, and says what to do instead', () => {
  const result = validateDocument({
    nodes: [{ id: 'h', type: 'heading', props: { text: 'x' }, children: [{ id: 'y', type: 'text', props: {} }] }],
  });
  assert.equal(result.valid, false);
  assert.match(result.message, /cannot hold children/);
});

test('duplicate ids are caught: they are what every op refers to', () => {
  const result = validateDocument({
    nodes: [
      { id: 'a', type: 'heading', props: { text: 'x' } },
      { id: 'a', type: 'heading', props: { text: 'y' } },
    ],
  });
  assert.match(result.message, /duplicate node id/);
});

test('a column outside a row is rejected wherever it appears', () => {
  const result = validateDocument({
    nodes: [{ id: 's', type: 'section', props: {}, children: [{ id: 'c', type: 'column', props: {}, children: [] }] }],
  });
  assert.match(result.message, /cannot go inside a section/);
});

test('props are validated against the node schema', () => {
  const result = validateDocument({
    nodes: [{ id: 'c', type: 'section', props: { width: 'enormous' }, children: [] }],
  });
  assert.match(result.message, /must be one of boxed, wide, full/);
});

/* ---------------------------------------------------------------- tokens */

test('tokens compile to custom properties, and a partial set still works', () => {
  const css = compileTokens(tokens);
  assert.match(css, /--accent:/);
  assert.match(compileTokens({ colors: { accent: '#ff0000' } }), /--accent:\s*#ff0000/);
});

test('a scoped token set only overrides what it names', () => {
  const { css, unknown } = compileTokenScope('brand', { colors: { accent: '#0f0' }, nope: 1 }, tokens);
  assert.match(css, /\[data-bz-tokens="brand"\]/);
  assert.ok(unknown.includes('nope'));
});

/* ----------------------------------------------------------------- forms */

test('a form renders its fields with the tagging attributes analytics needs', () => {
  const html = renderForm(CTX.forms.contact, CTX);
  assert.match(html, /data-bz-el="form"/);
  assert.match(html, /name="name"/);
});
