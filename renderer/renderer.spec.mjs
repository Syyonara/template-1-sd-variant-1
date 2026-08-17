import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  accepts,
  applyOps,
  bindTree,
  bindingsUsed,
  blockCatalogue,
  blockRegistry,
  clearCustomWidgets,
  componentSampleValues,
  componentValues,
  parseComponentProps,
  previewProps,
  compileNodeStyles,
  compileTokens,
  compileTokenScope,
  composeDocument,
  conditionMatches,
  customWidgetCss,
  customWidgets,
  ensureIds,
  findContentArea,
  fontFaceCss,
  fontPreloads,
  fontsHref,
  makeRow,
  makeSection,
  parseDocument,
  parseMenus,
  parseTemplates,
  parseWidgetDefinition,
  getBlock,
  BEHAVIOURS,
  BEHAVIOUR_PARTS,
  PARTS,
  UNIVERSAL_PROPS,
  widgetDefaultProps,
  widgetPreviewProps,
  registerCustomWidgets,
  renderDocument,
  renderWidgetPreview,
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
  // Declaration order follows the field table, not whatever order the editor
  // happened to write the keys in, so a shorthand can never land after the
  // longhand it would reset.
  assert.match(css, /\[data-bz-node="s1"\]\[data-bz-node\]\{padding-top:64px;background:#102030\}/);
  assert.match(css, /@media \(max-width: 640px\)\{\[data-bz-node="s1"\]\[data-bz-node\]\{padding-top:24px;text-align:center\}\}/);
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
          background: 'rgb(1 2 3)',
          textAlign: 'justify',
          paddingTop: 99999,
          // Layering is allowed, but not viewport-anchored layering: a fixed
          // node cannot be scrolled away from and covers the editor tooling.
          position: 'fixed',
          zIndex: 9999,
          aspectRatio: '16/0',
          gridColumns: 'repeat(3, 1fr) 40vh',
          backgroundImage: 'javascript:alert(1)',
          marginLeft: -80,
        },
      },
    },
  ]);
  assert.equal(css, '');
  assert.deepEqual(unknownStyleKeys({ base: { nonsense: 1 }, desktop: {} }), ['base.nonsense', 'desktop']);
});

test('the widened contract expresses the patterns real handoffs are built from', () => {
  const css = compileNodeStyles([
    {
      id: 'scrim',
      type: 'text',
      props: {},
      styles: {
        base: {
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          // Opacity would fade the copy with the scrim; an alpha background does not.
          background: '#1a1714@68%',
          backgroundImage: 'https://cdn.example.com/hero.jpg',
          backgroundSize: 'cover',
        },
      },
    },
    { id: 'card', type: 'text', props: {}, styles: { base: { aspectRatio: '4/3', radius: 999 } } },
    { id: 'panel', type: 'text', props: {}, styles: { base: { gridColumns: '240px 200px 1fr' } } },
    { id: 'footer', type: 'text', props: {}, styles: { base: { gridColumns: '1.4fr 1fr 1fr 1fr' } } },
    { id: 'rail', type: 'text', props: {}, styles: { base: { overflowX: 'auto', top: '100%' } } },
    { id: 'overlap', type: 'text', props: {}, styles: { base: { marginTop: -56 } } },
    { id: 'mirror', type: 'text', props: {}, styles: { tablet: { order: 2 } } },
    { id: 'moved', type: 'text', props: {}, styles: { base: { translateY: -8, scale: 1.02, rotate: 3 } } },
  ]);

  assert.match(css, /\[data-bz-node="scrim"\]\[data-bz-node\]\{[^}]*position:absolute/);
  assert.match(css, /inset:0px/);
  assert.match(css, /background:rgb\(26 23 20 \/ 68%\)/);
  // The shorthand precedes the image, so the image survives both being set.
  assert.match(css, /background:rgb\(26 23 20 \/ 68%\);background-image:url\("https:\/\/cdn\.example\.com\/hero\.jpg"\)/);
  assert.match(css, /\[data-bz-node="card"\]\[data-bz-node\]\{aspect-ratio:4 \/ 3;border-radius:999px\}/);
  assert.match(css, /\[data-bz-node="panel"\]\[data-bz-node\]\{grid-template-columns:240px 200px 1fr\}/);
  assert.match(css, /\[data-bz-node="footer"\]\[data-bz-node\]\{grid-template-columns:1.4fr 1fr 1fr 1fr\}/);
  assert.match(css, /\[data-bz-node="rail"\]\[data-bz-node\]\{top:100%;overflow-x:auto\}/);
  assert.match(css, /\[data-bz-node="overlap"\]\[data-bz-node\]\{margin-top:-56px\}/);
  assert.match(css, /@media \(max-width: 1100px\)\{\[data-bz-node="mirror"\]\[data-bz-node\]\{order:2\}\}/);
  // The four transform axes are separate bounded fields, composed on the way out.
  assert.match(css, /\[data-bz-node="moved"\]\[data-bz-node\]\{transform:translateY\(-8px\) rotate\(3deg\) scale\(1.02\)\}/);
});

/* ------------------------------------------------------------------ fonts */

test('self-hosted fonts compile to @font-face and suppress the Google request', () => {
  const brand = {
    fonts: {
      heading: 'INTL Headline',
      body: 'INTL Text',
      files: [
        { family: 'INTL Headline', url: 'https://cdn.example.com/f/INTLHeadline-Regular.woff2', weight: 400 },
        { family: 'INTL Headline', url: 'https://cdn.example.com/f/INTLHeadline-Bold.woff2', weight: '600 900' },
        { family: 'INTL Text', url: 'https://cdn.example.com/f/INTLText-Regular.woff2', weight: 400 },
        { family: 'INTL Text', url: 'https://cdn.example.com/f/INTLText-Italic.woff2', weight: 400, style: 'italic' },
      ],
    },
  };

  const css = fontFaceCss(brand);
  assert.match(css, /@font-face\{font-family:"INTL Headline";src:url\("https:\/\/cdn\.example\.com\/f\/INTLHeadline-Regular\.woff2"\) format\("woff2"\);font-weight:400;font-style:normal;font-display:swap;\}/);
  assert.match(css, /font-weight:600 900/);
  assert.match(css, /font-style:italic/);

  // Both families are self-hosted, so there is nothing left to ask Google for.
  assert.equal(fontsHref(brand), '');

  // Upright text weights of the two active families only — a bold heading face
  // does render above the fold, an italic almost never does — and capped so
  // preloading cannot compete with the hero image for bandwidth.
  const preloads = fontPreloads(brand);
  assert.deepEqual(preloads, [
    'https://cdn.example.com/f/INTLHeadline-Regular.woff2',
    'https://cdn.example.com/f/INTLHeadline-Bold.woff2',
    'https://cdn.example.com/f/INTLText-Regular.woff2',
  ]);
  assert.ok(!preloads.some((url) => url.includes('Italic')));
});

test('a font family that is not self-hosted still falls back to Google', () => {
  const mixed = {
    fonts: {
      heading: 'INTL Headline',
      body: 'Inter',
      files: [{ family: 'INTL Headline', url: '/fonts/INTLHeadline-Regular.woff2', weight: 400 }],
    },
  };
  const href = fontsHref(mixed);
  assert.match(href, /family=Inter/);
  assert.ok(!href.includes('INTL'));
});

test('unsafe or unusable font entries are dropped rather than repaired', () => {
  const css = fontFaceCss({
    fonts: {
      heading: 'X',
      body: 'X',
      files: [
        { family: 'X', url: 'http://insecure.example.com/a.woff2', weight: 400 },
        { family: 'X', url: 'javascript:alert(1)', weight: 400 },
        { family: 'X"} body{display:none', url: 'https://cdn.example.com/b.woff2', weight: 400 },
        { family: 'X', url: 'https://cdn.example.com/c.svg', weight: 400 },
        { family: 'X', url: 'https://cdn.example.com/d.woff2', weight: 5000 },
        { family: 'X', url: 'https://cdn.example.com/ok.woff2', weight: 400 },
      ],
    },
  });
  assert.equal((css.match(/@font-face/g) || []).length, 1);
  assert.match(css, /ok\.woff2/);
});

test('a border width still implies a visible border, per side', () => {
  const css = compileNodeStyles([
    { id: 'row', type: 'text', props: {}, styles: { base: { borderTopWidth: 1, borderColor: 'line' } } },
  ]);
  assert.match(css, /border-top-width:1px/);
  assert.match(css, /border-style:solid/);
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

/* --------------------------------------------------------- shared sections */

const SHARED_CTX = {
  ...CTX,
  sections: {
    'cta-band': {
      id: 'cta-band',
      name: 'CTA band',
      nodes: [
        {
          id: 'sec',
          type: 'section',
          props: { background: 'accent' },
          children: [{ id: 'h', type: 'heading', props: { text: 'Talk to us' } }],
        },
      ],
    },
  },
};

test('a shared section expands to its own tree where it sits', () => {
  const html = renderDocument(
    { nodes: [{ id: 'ref', type: 'sharedSection', props: { sectionId: 'cta-band' } }] },
    SHARED_CTX,
  );
  // The real markup, not a reference the visitor has to resolve.
  assert.match(html, /data-bz-section="cta-band"/);
  assert.match(html, /bz-section--bg-accent/);
  assert.match(html, /Talk to us/);
});

test('the same tree placed directly and through a shared section render alike', () => {
  const direct = renderDocument({ nodes: SHARED_CTX.sections['cta-band'].nodes }, SHARED_CTX);
  const shared = renderDocument(
    { nodes: [{ id: 'ref', type: 'sharedSection', props: { sectionId: 'cta-band' } }] },
    SHARED_CTX,
  );
  // Reuse must not restyle: the wrapper is the only difference.
  assert.ok(shared.includes(direct), 'the expansion must be the same markup, wrapped');
});

test('a shared section goes at the top level and nowhere else', () => {
  assert.equal(accepts(null, 'sharedSection'), true);
  // Its tree usually holds sections, which cannot sit in a column — so rather
  // than validate against contents that can change later, placement is fixed.
  assert.equal(accepts('column', 'sharedSection'), false);
  assert.equal(accepts('section', 'sharedSection'), false);
  assert.equal(accepts('row', 'sharedSection'), false);
  // It holds nothing of its own: it is edited in one place, not in the page.
  assert.equal(accepts('sharedSection', 'heading'), false);
  assert.equal(accepts('sharedSection', 'row'), false);
});

test('a missing shared section is visible in the editor and absent from the page', () => {
  const doc = { nodes: [{ id: 'ref', type: 'sharedSection', props: { sectionId: 'gone' } }] };

  const warnings = [];
  const published = renderDocument(doc, { ...SHARED_CTX, warn: (m) => warnings.push(m) });
  assert.equal(published, '', 'a visitor must not see a hole');
  assert.match(warnings.join(' '), /"gone"/);

  const editing = renderDocument(doc, { ...SHARED_CTX, editing: true });
  assert.match(editing, /bz-sharedsection--missing/);
  assert.match(editing, /no longer exists/);
});

test('a shared section that contains itself is cut, not overflowed', () => {
  const warnings = [];
  const html = renderDocument(
    { nodes: [{ id: 'ref', type: 'sharedSection', props: { sectionId: 'loop' } }] },
    {
      ...CTX,
      warn: (m) => warnings.push(m),
      sections: {
        loop: {
          id: 'loop',
          nodes: [
            {
              id: 'sec',
              type: 'section',
              children: [{ id: 'h', type: 'heading', props: { text: 'Once' } }],
            },
            { id: 'again', type: 'sharedSection', props: { sectionId: 'loop' } },
          ],
        },
      },
    },
  );
  // Rendered once, then stopped — and said so.
  assert.equal(html.match(/Once/g).length, 1);
  assert.match(warnings.join(' '), /contains itself/);
});

test("the editor never sees the expansion as part of the page's own tree", () => {
  const doc = { nodes: [{ id: 'ref', type: 'sharedSection', props: { sectionId: 'cta-band' } }] };

  const editing = renderDocument(doc, { ...SHARED_CTX, editing: true });
  // The canvas reads structure back out of the DOM, so the inner nodes must not
  // look like page nodes — otherwise a save would copy them into the page.
  assert.equal(editing.match(/data-bz-node/g).length, 1, 'only the reference itself is a node');
  assert.doesNotMatch(editing, /data-bz-type="section"/);
  assert.match(editing, /data-bz-opaque="1"/);

  // Published, the attributes stay: nothing is reading the page back there.
  const published = renderDocument(doc, SHARED_CTX);
  assert.match(published, /data-bz-type="section"/);
  assert.doesNotMatch(published, /data-bz-opaque/);
});

/* --------------------------------------------------- component placeholders */

/**
 * A component that renders the same content everywhere it is placed is reusable
 * in name only. These pin the three pieces that make it genuinely reusable:
 * declared props, `{{key}}` bindings in the tree, and a node that repeats over a
 * list. Between them they are what lets one carousel definition serve a page with
 * four logos and a page with twelve.
 */
const LOGOS = {
  id: 'logos',
  name: 'Logo carousel',
  props: [
    { key: 'heading', type: 'text', label: 'Heading', default: 'Brands we carry' },
    {
      key: 'logos',
      type: 'list',
      label: 'Logos',
      fields: [
        { key: 'image', type: 'image', label: 'Logo' },
        { key: 'name', type: 'text', label: 'Name' },
      ],
    },
  ],
  nodes: [
    {
      id: 'sec',
      type: 'section',
      props: { behaviour: 'carousel' },
      children: [
        { id: 'title', type: 'heading', props: { text: '{{heading}}' } },
        {
          id: 'rail',
          type: 'row',
          props: { part: 'track' },
          children: [
            {
              id: 'slide',
              type: 'column',
              props: { span: 3, part: 'slide', repeat: 'logos' },
              children: [{ id: 'pic', type: 'image', props: { image: '{{image}}', alt: '{{name}}' } }],
            },
          ],
        },
      ],
    },
  ],
};

const LOGO_CTX = { ...CTX, sections: { logos: LOGOS } };

const place = (values, ctx = LOGO_CTX) =>
  renderDocument(
    { nodes: [{ id: 'ref', type: 'sharedSection', props: { sectionId: 'logos', values } }] },
    ctx,
  );

test('a placement supplies its own content, and omissions fall back to defaults', () => {
  const html = place({ heading: 'Our partners' });
  assert.match(html, /Our partners/);
  assert.doesNotMatch(html, /Brands we carry/);
  // A binding must never reach the page as its own source text.
  assert.doesNotMatch(html, /\{\{/);

  assert.match(place({}), /Brands we carry/, 'no value given means the declared default');
});

test('two placements of one component do not see each other content', () => {
  const first = place({ heading: 'First' });
  const second = place({ heading: 'Second' });
  assert.match(first, /First/);
  assert.doesNotMatch(first, /Second/);
  assert.match(second, /Second/);
  assert.doesNotMatch(second, /First/);
});

test('a node bound to a list repeats once per item', () => {
  const html = place({
    logos: [
      { image: { src: '/a.png', alt: 'A' }, name: 'Alpha' },
      { image: { src: '/b.png', alt: 'B' }, name: 'Beta' },
      { image: { src: '/c.png', alt: 'C' }, name: 'Gamma' },
    ],
  });
  assert.equal(html.match(/bz-col/g).length, 3, 'three logos, three slides');
  assert.match(html, /\/a\.png/);
  assert.match(html, /\/c\.png/);
  // Ids stay unique or the canvas would treat two slides as the same slide.
  assert.doesNotMatch(html, /data-bz-node="slide"/);
  assert.match(html, /data-bz-node="slide-1"/);
  assert.match(html, /data-bz-node="slide-3"/);
});

test('an image prop bound whole receives the object, not its string form', () => {
  const html = place({ logos: [{ image: { src: '/logo.svg', alt: 'ACME' }, name: 'ACME' }] });
  // The bug this exists to prevent: `src="[object Object]"`, or `src=""`.
  assert.match(html, /src="\/logo\.svg"/);
  assert.doesNotMatch(html, /object Object/);
  assert.doesNotMatch(html, /src=""/);
});

test('a binding inside a sentence interpolates rather than replacing it', () => {
  const nodes = bindTree(
    [{ id: 'p', type: 'paragraph', props: { text: 'Trusted by {{count}} dealers since {{year}}.' } }],
    { count: 40, year: '1998' },
  );
  assert.equal(nodes[0].props.text, 'Trusted by 40 dealers since 1998.');
});

test("a dealer's content is data, not a template that gets evaluated again", () => {
  // Someone writing "{{ }}" in a heading means those characters. Re-scanning a
  // supplied value would make dealer content executable and could recurse.
  const html = place({ heading: 'Braces {{heading}} stay put' });
  assert.match(html, /Braces \{\{heading\}\} stay put/);
});

test('an empty list renders nothing published, and one placeholder in the editor', () => {
  assert.doesNotMatch(place({ logos: [] }), /bz-col/, 'a visitor must not see a phantom slide');
  const editing = place({ logos: [] }, { ...LOGO_CTX, editing: true });
  assert.match(editing, /bz-col/, 'a repeat that vanishes looks like a bug to whoever built it');
});

test('a component with no props declared behaves exactly as it did before', () => {
  const html = renderDocument(
    { nodes: [{ id: 'ref', type: 'sharedSection', props: { sectionId: 'cta-band' } }] },
    SHARED_CTX,
  );
  assert.match(html, /Talk to us/);
});

test('bindingsUsed finds every prop a tree depends on', () => {
  const used = bindingsUsed(LOGOS.nodes);
  assert.deepEqual([...used].sort(), ['heading', 'image', 'logos', 'name']);
});

test('stale values for props the component dropped are not fed to the tree', () => {
  const values = componentValues(parseComponentProps(LOGOS.props), {
    heading: 'Kept',
    removedLongAgo: 'Should not survive',
  });
  assert.deepEqual(Object.keys(values).sort(), ['heading', 'logos']);
});

/**
 * The canvas renders node by node, so it cannot use `bindTree`. Without this a
 * slide showed the literal text `{{name}}`, which reads as a broken component
 * rather than as a decision the placing page will make.
 */
test('a preview resolves a binding against the sample values', () => {
  const props = parseComponentProps(LOGOS.props);
  const values = componentSampleValues(props);
  const shown = previewProps({ text: '{{heading}}', level: 2 }, values);
  assert.equal(shown.text, values.heading);
  assert.equal(shown.level, 2, 'an unbound prop is untouched');
});

test('a preview inside a repeat resolves the item, not the outer scope', () => {
  const props = parseComponentProps(LOGOS.props);
  const values = componentSampleValues(props);
  const item = values.logos[0];
  const shown = previewProps({ image: '{{image}}', alt: '{{name}}' }, values, item);
  assert.deepEqual(shown.image, item.image, 'an image resolves whole, not as a string');
  assert.equal(shown.alt, item.name);
});

test('a preview drops repeat, which is an instruction rather than a prop', () => {
  const shown = previewProps({ repeat: 'logos', span: 3 }, { logos: [] });
  assert.equal('repeat' in shown, false);
  assert.equal(shown.span, 3);
});

test('a preview leaves a binding nothing declares empty rather than literal', () => {
  const shown = previewProps({ text: '{{nobodyDeclaredThis}}' }, {});
  assert.equal(shown.text, '');
});

/* ------------------------------------------------------ widget previews */

/**
 * The editor's preview was empty for every widget, always, and silently.
 * `renderDocument` resolves a node's type through the registry, and a definition
 * being edited is not in it — so a new widget rendered nothing and a saved one
 * rendered its last committed version. These pin the preview to the definition in
 * front of the dealer.
 */
test('a preview renders the definition being edited, not the registered one', () => {
  clearCustomWidgets();
  const def = {
    id: 'promo-strip',
    label: 'Promo strip',
    props: [{ key: 'heading', type: 'text', label: 'Heading' }],
    html: '<div class="promo"><h3>{{heading}}</h3></div>',
    css: '.promo{display:flex}',
  };

  const out = renderWidgetPreview(def);
  assert.deepEqual(out.errors, []);
  assert.match(out.html, /class="promo"/);
  // Nothing was registered: an unregistered definition still previews.
  assert.equal(getBlock('promo-strip'), null);
  // The wrapper is load-bearing — the CSS is scoped to it.
  assert.match(out.css, /\.bz-block--promo-strip \.promo/);
  assert.match(out.html, /bz-block--promo-strip/);
});

test('a preview fills a repeating list, because an empty one shows nothing', () => {
  const def = {
    id: 'logo-wall',
    label: 'Logo wall',
    props: [{ key: 'logos', type: 'list', label: 'Logo', fields: [{ key: 'image', type: 'image', label: 'Logo' }] }],
    html: '<div class="wall">{{#each logos}}<span>{{img image}}</span>{{/each}}</div>',
  };

  // What a real placed instance starts with — deliberately empty.
  assert.deepEqual(widgetDefaultProps(def).logos, []);

  // What the preview shows instead, so the layout is judgeable.
  assert.equal(widgetPreviewProps(def).logos.length, 3);
  const out = renderWidgetPreview(def);
  assert.equal(out.html.match(/<img/g).length, 3);
  // No network and no uploaded asset needed for a placeholder.
  assert.match(out.html, /data:image\/svg\+xml/);
});

test('a preview keeps the behaviour wiring the published page relies on', () => {
  const out = renderWidgetPreview({
    id: 'quote-slider',
    label: 'Quote slider',
    props: [{ key: 'quotes', type: 'list', label: 'Quote', fields: [{ key: 'text', type: 'text', label: 'Quote' }] }],
    html:
      '<div data-bz-behavior="carousel" data-bz-behavior-options=\'{"label":"Quotes"}\'>' +
      '<div data-bz-part="track">{{#each quotes}}<blockquote data-bz-part="slide">{{text}}</blockquote>{{/each}}</div>' +
      '<button data-bz-part="prev">Prev</button><button data-bz-part="next">Next</button></div>',
  });
  // Behaviour is bound from these attributes at runtime, so a preview that
  // stripped them could not be made interactive later.
  assert.match(out.html, /data-bz-behavior="carousel"/);
  assert.equal(out.html.match(/data-bz-part="slide"/g).length, 3);
  assert.match(out.html, /data-bz-part="track"/);
});

test('a broken template previews as its error, never as a blank box', () => {
  const out = renderWidgetPreview({ id: 'bad', label: 'Bad', html: '<div data-bz-slot="main"></div>' });
  assert.equal(out.html, '');
  assert.ok(out.errors.length, 'the reason has to reach the dealer');
});

/* -------------------------------------------- behaviours on canvas nodes */

/**
 * The reason a carousel had to be hand-written as a custom widget: no node a
 * dealer could drag carried the attributes the client script binds from. These
 * pin the whole wiring for a logo carousel built entirely out of layout nodes.
 */
test('a tree of layout nodes carries a full carousel', () => {
  const html = renderDocument({
    nodes: [
      {
        id: 'logos',
        type: 'section',
        props: { behaviour: 'carousel', behaviourOptions: '{"label":"Our partners","perMove":2}' },
        children: [
          {
            id: 'rail',
            type: 'row',
            props: { part: 'track' },
            children: [
              { id: 'c1', type: 'column', props: { span: 3, part: 'slide' }, children: [] },
              { id: 'c2', type: 'column', props: { span: 3, part: 'slide' }, children: [] },
            ],
          },
        ],
      },
    ],
  });

  assert.match(html, /<section[^>]+data-bz-behavior="carousel"/);
  // Options reach the script as JSON on the attribute it reads.
  assert.match(html, /data-bz-behavior-options="[^"]*Our partners/);
  // The rail: blocks.css styles the scroll-snap strip off the attribute the
  // script sets on whatever is marked as the track.
  assert.match(html, /data-bz-part="track"/);
  assert.equal(html.match(/data-bz-part="slide"/g).length, 2);
});

test('a widget instance can be a behaviour part, so arrows are placeable', () => {
  const html = renderDocument({
    nodes: [
      {
        id: 's',
        type: 'section',
        props: { behaviour: 'carousel' },
        children: [
          {
            id: 'nav',
            type: 'row',
            children: [
              {
                id: 'col',
                type: 'column',
                props: { span: 12 },
                children: [{ id: 'n', type: 'buttons', props: { items: [{ label: 'Next', url: '#' }], part: 'next' } }],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.match(html, /data-bz-part="next"/);
});

test('an unknown behaviour or part is dropped with a warning, never emitted', () => {
  const warnings = [];
  const html = renderDocument(
    { nodes: [{ id: 'x', type: 'section', props: { behaviour: 'sparkle', part: 'wheel' } }] },
    { warn: m => warnings.push(m) },
  );
  assert.doesNotMatch(html, /data-bz-behavior|data-bz-part/);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Unknown behaviour "sparkle"/);
});

test('malformed behaviour options are dropped, not written into the attribute', () => {
  const warnings = [];
  const html = renderDocument(
    { nodes: [{ id: 'x', type: 'section', props: { behaviour: 'carousel', behaviourOptions: '{oops' } }] },
    { warn: m => warnings.push(m) },
  );
  // The behaviour still binds — losing its settings must not lose the behaviour.
  assert.match(html, /data-bz-behavior="carousel"/);
  assert.doesNotMatch(html, /data-bz-behavior-options/);
  assert.match(warnings[0], /not valid JSON/);
});

test('every part name a behaviour looks for is in the vocabulary', () => {
  // The picker and the validator both offer PARTS; a part implemented but absent
  // from the list would be rejected as a typo and fail silently for a dealer.
  for (const [behaviour, parts] of Object.entries(BEHAVIOUR_PARTS)) {
    assert.ok(BEHAVIOURS.includes(behaviour), `${behaviour} is implemented`);
    for (const name of Object.keys(parts)) {
      assert.ok(PARTS.includes(name), `${behaviour}/${name} is offerable`);
    }
  }
});

test('anchor and scope are declared props, not renderer-only conventions', () => {
  // `renderNode` has always read these off any widget's wrapper while no widget
  // declared them, so a validator walking a widget schema refused them.
  assert.ok(UNIVERSAL_PROPS.anchor, 'anchor is stated');
  assert.ok(UNIVERSAL_PROPS.scope, 'scope is stated');
  assert.ok(UNIVERSAL_PROPS.behaviour.enum.includes('carousel'));
  // Empty is a legal value: it is how the inspector says "no behaviour".
  assert.ok(UNIVERSAL_PROPS.part.enum.includes(''));
});

test('an image prop interpolated into src renders the image, not an empty tag', () => {
  // `{{logo}}` inside src="…" is the first thing anyone writing this template
  // reaches for, the AI included. It used to yield src="" — a broken image with
  // nothing anywhere explaining why.
  const out = renderWidgetPreview({
    id: 'logo-wall',
    label: 'Logo wall',
    props: [
      {
        key: 'logos',
        type: 'list',
        label: 'Logo',
        fields: [
          { key: 'image', type: 'image', label: 'Logo' },
          { key: 'altText', type: 'text', label: 'Alt text' },
        ],
      },
    ],
    html: '{{#each logos}}<img src="{{image}}" alt="{{altText}}"/>{{/each}}',
  });
  assert.doesNotMatch(out.html, /src=""/);
  assert.equal(out.html.match(/data:image\/svg\+xml/g).length, 3);
  assert.match(out.html, /alt="Alt text 1"/);
});
