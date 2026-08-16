// Emit the node catalogue as plain JSON.
//
// The Vendure plugin and the dashboard both need to know what can be placed and
// what each thing takes — the plugin to build the AI contract and validate what
// comes back, the dashboard to build the inspector and to register GrapesJS
// component types. Neither can import an ESM module out of this repo at build
// time, so the catalogue is exported here and vendored, with the check script
// failing if the vendored copy has drifted from the renderer that renders.
//
// Run: node scripts/export-schemas.mjs

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RENDERER_VERSION,
  DOCUMENT_VERSION,
  CONDITION_TYPES,
  GRID_COLUMNS,
  MENU_ITEM_TYPES,
  MAX_MENU_DEPTH,
  PROP_TYPES,
  ROW_PRESETS,
  TOKEN_GROUPS,
  DEFAULT_TOKENS,
  WIDGET_GROUPS,
  STYLE_BUCKETS,
  STYLE_FIELDS,
  blockCatalogue,
  layoutCatalogue,
  staticWidgetIds,
} from '../renderer/index.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'block-schemas.json');

/**
 * `accepts` as data.
 *
 * The predicate itself cannot be vendored — it is code — but its whole truth
 * table can, and that is what the dashboard turns into GrapesJS `droppable`
 * rules and what the AI contract states. One table, three consumers, no chance
 * of the editor allowing a drop the build rejects.
 */
const layout = layoutCatalogue();
const nesting = {
  root: { accepts: ['section', 'row', 'contentArea', 'widget'] },
  ...Object.fromEntries(layout.map(node => [node.id, { accepts: node.accepts }])),
};

const catalogue = {
  rendererVersion: RENDERER_VERSION,
  documentVersion: DOCUMENT_VERSION,
  gridColumns: GRID_COLUMNS,
  tokenGroups: TOKEN_GROUPS,
  // The starter token set travels with the catalogue so the dashboard can offer
  // a full, editable design system for a repo that has no tokens file yet.
  defaultTokens: DEFAULT_TOKENS,
  menuItemTypes: MENU_ITEM_TYPES,
  maxMenuDepth: MAX_MENU_DEPTH,
  conditionTypes: CONDITION_TYPES,
  rowPresets: ROW_PRESETS,
  widgetGroups: WIDGET_GROUPS,
  staticWidgets: staticWidgetIds(),
  // Prop editor types a custom widget definition may declare.
  customWidgetPropTypes: PROP_TYPES,
  // Instance style overrides: the fields a node's `styles` buckets may set.
  // Functions cannot travel as JSON, so the validator gets names + options and
  // enforces "known field" — value shape is re-checked by the renderer at
  // compile time, which drops anything invalid rather than emitting it.
  styleBuckets: STYLE_BUCKETS.map(b => b.key),
  styleFields: Object.fromEntries(
    Object.entries(STYLE_FIELDS).map(([key, spec]) => [
      key,
      { css: spec.css, label: spec.label, ...(spec.options ? { options: spec.options } : {}) },
    ]),
  ),
  layout,
  nesting,
  widgets: blockCatalogue(),
};

writeFileSync(OUT, JSON.stringify(catalogue, null, 2) + '\n');
console.log(
  `Exported ${catalogue.layout.length} layout nodes and ${catalogue.widgets.length} widgets ` +
    `-> renderer/block-schemas.json`,
);
