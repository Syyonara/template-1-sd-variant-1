// The document model.
//
// A page, a template and a custom widget are all the same thing: a tree of
// nodes. `{ id, type, props, children }`. Layout is expressed by nesting, not by
// a special prop on one block.
//
// This replaces a flat list where nesting was an exception — a `row` block whose
// `props.columns` held arrays of other blocks. That model could not express what
// a visual builder is for. A column could not hold a row, so no nested grid; a
// move always landed at the top level, so nothing could be dragged into a
// column; and the editor had to special-case one prop name to know where
// children lived, which meant GrapesJS could not treat containers as containers.
//
// The vocabulary here is the one every visual builder uses, and — more
// importantly — the one three consumers now share exactly:
//
//   section       Full-bleed band. Holds rows and widgets.
//   row           A 12-column grid. Holds columns, and nothing else.
//   column        A span of that grid. Holds rows (nested grids) and widgets.
//   contentArea   Where a page's own content is injected into a template.
//   <widget>      A leaf. Heading, image, product grid, a custom widget.
//
// GrapesJS registers one component type per line of that table, the AI is given
// the same table, and this module renders it. There is no translation layer
// between the three, because there is nothing to translate.

import { attrs, cls, esc } from './html.mjs';
import { getBlock } from './blocks.mjs';

export const DOCUMENT_VERSION = 2;

/** Node types the layout system owns. Everything else is a widget. */
export const LAYOUT_TYPES = ['section', 'row', 'column', 'contentArea'];

/** Layout types that accept children. */
export const CONTAINER_TYPES = ['section', 'row', 'column'];

/** The grid a row divides into. Twelve, because thirds and quarters both work. */
export const GRID_COLUMNS = 12;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/* ------------------------------------------------------------ definitions */

const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const bool = description => ({ type: 'boolean', description });

const SECTION_BACKGROUNDS = ['none', 'paper', 'card', 'ink', 'accent'];

/**
 * The layout registry.
 *
 * Deliberately the same shape as the widget registry — `{ label, category,
 * schema, render }` — so a consumer that walks "everything that can be placed"
 * does not need to know which of the two a type came from.
 */
export const LAYOUT_REGISTRY = {
  section: {
    id: 'section',
    label: 'Section',
    category: 'layout',
    accepts: ['row', 'widget'],
    autoTagged: true,
    schema: {
      type: 'object',
      properties: {
        width: str('How wide the content inside runs.', {
          enum: ['boxed', 'wide', 'full'],
          default: 'boxed',
        }),
        background: str('Surface behind this section.', {
          enum: SECTION_BACKGROUNDS,
          default: 'none',
        }),
        paddingY: int('Vertical padding, on the spacing scale.', { minimum: 0, maximum: 10, default: 7 }),
        anchor: str('An id, so a link can jump here. Lower-case, no spaces.'),
        minHeight: str('Minimum height.', { enum: ['auto', 'half', 'full'], default: 'auto' }),
        align: str('Vertical alignment when the section is taller than its content.', {
          enum: ['start', 'center', 'end'],
          default: 'start',
        }),
      },
    },
    render(node, ctx, renderChildren) {
      const props = node.props || {};
      const inner = renderChildren(node.children, ctx);
      const width = props.width || 'boxed';
      const body =
        width === 'full' ? inner : `<div class="${cls('bz-container', width === 'wide' && 'bz-container--wide')}">${inner}</div>`;
      return `<section${attrs({
        class: cls(
          'bz-section',
          `bz-section--bg-${props.background || 'none'}`,
          props.minHeight && props.minHeight !== 'auto' && `bz-section--h-${props.minHeight}`,
          props.align && props.align !== 'start' && `bz-section--v-${props.align}`,
        ),
        id: props.anchor || null,
        style: styleVars({ '--bz-pad': spacing(props.paddingY) }),
        'data-bz-node': node.id || null,
        'data-bz-type': 'section',
      })}>${body}</section>`;
    },
  },

  row: {
    id: 'row',
    label: 'Row',
    category: 'layout',
    accepts: ['column'],
    autoTagged: true,
    schema: {
      type: 'object',
      properties: {
        gap: int('Space between columns, on the spacing scale.', { minimum: 0, maximum: 10, default: 6 }),
        align: str('How columns line up vertically.', {
          enum: ['stretch', 'start', 'center', 'end'],
          default: 'stretch',
        }),
        stackOn: str('Width at which the columns stack.', {
          enum: ['mobile', 'tablet', 'never'],
          default: 'mobile',
        }),
        reverseStacked: bool('When stacked, show the columns in reverse order.'),
      },
    },
    render(node, ctx, renderChildren) {
      const props = node.props || {};
      return `<div${attrs({
        class: cls(
          'bz-row',
          `bz-row--stack-${props.stackOn || 'mobile'}`,
          props.align && props.align !== 'stretch' && `bz-row--v-${props.align}`,
          props.reverseStacked && 'bz-row--rev',
        ),
        style: styleVars({ '--bz-gap': spacing(props.gap ?? 6) }),
        'data-bz-node': node.id || null,
        'data-bz-type': 'row',
      })}>${renderChildren(node.children, ctx)}</div>`;
    },
  },

  column: {
    id: 'column',
    label: 'Column',
    category: 'layout',
    accepts: ['row', 'widget'],
    autoTagged: true,
    schema: {
      type: 'object',
      properties: {
        span: int(`How many of the ${GRID_COLUMNS} grid columns this takes.`, {
          minimum: 1,
          maximum: GRID_COLUMNS,
          default: 6,
        }),
        align: str('Vertical alignment of this column within the row.', {
          enum: ['auto', 'start', 'center', 'end'],
          default: 'auto',
        }),
        padding: int('Inner padding, on the spacing scale.', { minimum: 0, maximum: 10, default: 0 }),
        background: str('Surface behind this column.', { enum: SECTION_BACKGROUNDS, default: 'none' }),
      },
    },
    render(node, ctx, renderChildren) {
      const props = node.props || {};
      const span = clamp(props.span ?? 6, 1, GRID_COLUMNS);
      return `<div${attrs({
        class: cls(
          'bz-col',
          props.align && props.align !== 'auto' && `bz-col--v-${props.align}`,
          props.background && props.background !== 'none' && `bz-col--bg-${props.background}`,
        ),
        style: styleVars({
          '--bz-span': String(span),
          '--bz-col-pad': props.padding ? spacing(props.padding) : null,
        }),
        'data-bz-node': node.id || null,
        'data-bz-type': 'column',
      })}>${renderChildren(node.children, ctx)}</div>`;
    },
  },

  contentArea: {
    id: 'contentArea',
    label: 'Content area',
    category: 'layout',
    accepts: [],
    autoTagged: true,
    schema: {
      type: 'object',
      properties: {
        label: str('What this area is for, shown in the template editor.', { default: 'Page content' }),
      },
    },
    /**
     * In a composed render this node never reaches here — `renderDocument`
     * substitutes the page's own nodes for it. It renders standalone only when a
     * template is previewed on its own, and then it has to be visible: a template
     * editor that draws nothing where the content goes is the reason nobody could
     * tell what a template was.
     */
    render(node, ctx) {
      const label = (node.props && node.props.label) || 'Page content';
      if (!ctx || !ctx.editing) return '';
      return `<div${attrs({
        class: 'bz-contentarea',
        'data-bz-node': node.id || null,
        'data-bz-type': 'contentArea',
      })}><span class="bz-contentarea__label">${esc(label)}</span></div>`;
    },
  },
};

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function spacing(step) {
  const n = clamp(step ?? 0, 0, 10);
  return n === 0 ? '0px' : `var(--space-${n})`;
}

function styleVars(map) {
  const parts = Object.entries(map)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}:${v}`);
  return parts.length ? parts.join(';') : null;
}

/** A layout definition, or null for a widget type. */
export function getLayout(type) {
  return LAYOUT_REGISTRY[type] || null;
}

export function isLayout(type) {
  return !!LAYOUT_REGISTRY[type];
}

export function isContainer(type) {
  return CONTAINER_TYPES.includes(type);
}

/**
 * May a node of type `child` be placed inside one of type `parent`?
 *
 * The single source of this answer. GrapesJS builds its `droppable` rules from
 * it, the validator enforces it, and the AI contract states it — so a drop the
 * editor allows can never be a tree the build rejects.
 */
export function accepts(parentType, childType) {
  // The document root takes anything except a bare column, which has no grid to
  // sit in. Sections are the usual top level, but a row or a widget placed
  // straight on the page is a normal thing to want and refusing it would be a
  // rule the dealer has to learn for no reason.
  if (parentType == null) return childType !== 'column';
  const layout = getLayout(parentType);
  if (!layout) return false;
  if (childType === 'contentArea') return parentType === 'section' || parentType === 'column';
  if (isLayout(childType)) return layout.accepts.includes(childType);
  return layout.accepts.includes('widget');
}

/* ------------------------------------------------------------------- parse */

/**
 * Normalise whatever is on disk into `{ version, nodes }`.
 *
 * Accepts the canonical form, a bare array, and — the reason this is not a
 * one-liner — the v1 block list, where a `row` block carried its children in
 * `props.columns`. Those repos are live, so they are migrated on read rather
 * than requiring a rewrite before a dealer can open their own site.
 */
export function parseDocument(raw) {
  if (raw == null) return { version: DOCUMENT_VERSION, nodes: [] };
  if (Array.isArray(raw)) return { version: DOCUMENT_VERSION, nodes: raw.map(migrateNode).filter(Boolean) };
  if (!isObject(raw)) return { version: DOCUMENT_VERSION, nodes: [] };

  const list = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(raw.blocks) ? raw.blocks : [];
  return { version: DOCUMENT_VERSION, nodes: migrateList(list) };
}

/**
 * Migrate a sibling list, splicing out children a v1 widget could no longer hold.
 *
 * A v1 custom widget declared slots and kept their contents in `props.columns`.
 * Widgets are leaves now, so those children have nowhere to go inside — but
 * dropping them would delete a dealer's content on read. They are lifted to sit
 * beside the widget instead, which is visible and recoverable.
 */
function migrateList(list) {
  const out = [];
  for (const raw of list || []) {
    const node = migrateNode(raw);
    if (!node) continue;
    const lifted = node.__lifted;
    delete node.__lifted;
    out.push(node);
    if (lifted) out.push(...lifted);
  }
  return out;
}

/**
 * One v1 block, as a node.
 *
 * The interesting cases are the two layout blocks. A v1 `row` held arrays of
 * blocks in `props.columns` with no column node of its own, so each array
 * becomes a real column whose span is an equal share of the grid. A `bar` was the
 * same idea for chrome. Everything else was already a leaf and only loses the
 * prop that used to carry children.
 */
function migrateNode(raw) {
  if (!isObject(raw) || !raw.type) return null;
  const props = isObject(raw.props) ? raw.props : {};
  const columns = Array.isArray(props.columns) ? props.columns : null;
  // Instance style overrides ride along untouched; every branch below rebuilds
  // the node, and a rebuild that forgets this key silently unstyles the page.
  const styles = isObject(raw.styles) ? { styles: raw.styles } : {};

  // The v1 check runs first, and has to: `row` is a layout type in both models,
  // so recognising it as one before looking at `props.columns` would take the
  // v2 branch and throw away every child the old row was holding.
  if ((raw.type === 'row' || raw.type === 'bar') && columns && !Array.isArray(raw.children)) {
    const span = Math.max(1, Math.round(GRID_COLUMNS / Math.max(1, columns.length)));
    return {
      id: raw.id,
      type: 'row',
      ...styles,
      props: {
        gap: 6,
        align: props.align === 'center' ? 'center' : 'stretch',
      },
      children: columns.map((cell, i) => ({
        id: `${raw.id || 'row'}-c${i + 1}`,
        type: 'column',
        props: { span },
        children: migrateList(Array.isArray(cell) ? cell : []),
      })),
    };
  }

  if (isLayout(raw.type) || Array.isArray(raw.children)) {
    return {
      id: raw.id,
      type: raw.type,
      props: stripColumns(props),
      ...styles,
      ...(isContainer(raw.type) || Array.isArray(raw.children)
        ? { children: migrateList(raw.children) }
        : {}),
    };
  }

  // A v1 custom widget could declare slots, also carried in `props.columns`.
  // Nesting is now the layout system's job, so those children are lifted out
  // beside the widget rather than silently dropped.
  if (columns) {
    const lifted = migrateList(columns.flat());
    const node = { id: raw.id, type: raw.type, props: stripColumns(props), ...styles };
    return lifted.length ? { ...node, __lifted: lifted } : node;
  }

  return { id: raw.id, type: raw.type, props, ...styles };
}

function stripColumns(props) {
  const { columns, ...rest } = props;
  return rest;
}

/* ------------------------------------------------------------------ render */

function renderNode(node, ctx, depth) {
  if (!isObject(node) || !node.type) return '';

  const layout = getLayout(node.type);
  if (layout) {
    return layout.render(node, ctx, (children, childCtx) => renderList(children, childCtx || ctx, depth + 1));
  }

  const widget = getBlock(node.type);
  if (!widget) {
    if (ctx.warn) ctx.warn(`Unknown widget "${node.type}" (${node.id || '?'}) — skipped.`);
    return '';
  }
  if (!widget.autoTagged && ctx.warn) {
    ctx.warn(
      `"${node.type}" (${node.id || '?'}) is not auto-tagged — analytics attributes are the author's responsibility.`,
    );
  }

  const props = isObject(node.props) ? node.props : {};
  // The widget signature is unchanged, so every existing widget renders as it
  // did. `renderChildren` is passed for compatibility and receives an empty list:
  // widgets are leaves, and layout does the nesting.
  const inner = widget.render(props, ctx, node, () => '');
  if (!inner) return '';

  return `<div${attrs({
    class: cls('bz-block', `bz-block--${node.type}`, props.scope && 'bz-scoped'),
    id: props.anchor || null,
    'data-bz-node': node.id || null,
    'data-bz-type': node.type,
    'data-bz-tokens': props.scope || null,
  })}>${inner}</div>`;
}

function renderList(nodes, ctx, depth) {
  return (nodes || [])
    .map(node => renderNode(node, ctx, depth))
    .filter(Boolean)
    .join('\n');
}

/** Render a document. */
export function renderDocument(raw, ctx = {}) {
  return renderList(parseDocument(raw).nodes, ctx, 0);
}

/* -------------------------------------------------------------- traversal */

/** Visit every node, depth-first, with its parent and index. */
export function walkNodes(raw, visit) {
  const step = (nodes, parent) => {
    (nodes || []).forEach((node, index) => {
      if (!isObject(node)) return;
      visit(node, parent, index);
      if (Array.isArray(node.children)) step(node.children, node);
    });
  };
  step(parseDocument(raw).nodes, null);
}

/** Every id in a document, in document order. Duplicates are reported as-is. */
export function nodeIds(raw) {
  const ids = [];
  walkNodes(raw, node => node.id && ids.push(node.id));
  return ids;
}

/** Find a node and where it sits. Operates on a live tree, not a copy. */
export function locateNode(nodes, id) {
  const step = (list, parent) => {
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (!isObject(node)) continue;
      if (node.id === id) return { list, index: i, node, parent };
      if (Array.isArray(node.children)) {
        const hit = step(node.children, node);
        if (hit) return hit;
      }
    }
    return null;
  };
  return step(nodes, null);
}

/** A short, stable, unique id derived from the type. */
export function nextNodeId(type, taken) {
  const used = new Set(taken);
  const base = String(type)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'node';
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Give every node an id, in place, without renaming one that already has it.
 *
 * Ids are how the AI, the editor and git history refer to a node, so a tree that
 * arrived from a drop or a model reply is stamped once rather than being allowed
 * to carry blanks that later collide.
 */
export function ensureIds(nodes, taken = []) {
  const used = new Set(taken);
  const step = list => {
    for (const node of list || []) {
      if (!isObject(node)) continue;
      if (!node.id || used.has(node.id)) node.id = nextNodeId(node.type, used);
      used.add(node.id);
      if (Array.isArray(node.children)) step(node.children);
    }
  };
  step(nodes);
  return nodes;
}

/* --------------------------------------------------------------- builders */

/** A row of `spans.length` columns, e.g. `makeRow([6, 6])` for a two-column row. */
export function makeRow(spans, taken = []) {
  const used = new Set(taken);
  const id = nextNodeId('row', used);
  used.add(id);
  return {
    id,
    type: 'row',
    props: { gap: 6 },
    children: spans.map(span => {
      const columnId = nextNodeId('column', used);
      used.add(columnId);
      return { id: columnId, type: 'column', props: { span: clamp(span, 1, GRID_COLUMNS) }, children: [] };
    }),
  };
}

/** A section wrapping whatever is given, which is how every preset is built. */
export function makeSection(children = [], props = {}, taken = []) {
  const used = new Set(taken);
  const id = nextNodeId('section', used);
  return { id, type: 'section', props: { width: 'boxed', paddingY: 7, ...props }, children };
}

/**
 * Column presets, offered as one-click layouts.
 *
 * Named the way a person describes them rather than by their spans, because
 * "two thirds and a third" is what someone is looking for and `[8, 4]` is not.
 */
export const ROW_PRESETS = [
  { id: 'one', label: 'One column', spans: [12] },
  { id: 'two', label: 'Two columns', spans: [6, 6] },
  { id: 'three', label: 'Three columns', spans: [4, 4, 4] },
  { id: 'four', label: 'Four columns', spans: [3, 3, 3, 3] },
  { id: 'left-wide', label: 'Two thirds + a third', spans: [8, 4] },
  { id: 'right-wide', label: 'A third + two thirds', spans: [4, 8] },
  { id: 'sidebar-left', label: 'Sidebar + content', spans: [3, 9] },
  { id: 'sidebar-right', label: 'Content + sidebar', spans: [9, 3] },
];

/** The layout catalogue, in the shape the editor and the AI contract consume. */
export function layoutCatalogue() {
  return Object.values(LAYOUT_REGISTRY).map(def => ({
    id: def.id,
    label: def.label,
    category: 'layout',
    accepts: def.accepts,
    autoTagged: true,
    schema: def.schema,
  }));
}
