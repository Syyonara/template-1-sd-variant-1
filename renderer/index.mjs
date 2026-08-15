// @buzznerd/site-renderer — the single source of truth for turning a dealer's
// site data into HTML.
//
// Three consumers must agree exactly, and they can only agree because they share
// this module rather than each having a view of the same idea:
//
//   scripts/build.mjs      renders the published site on Vercel
//   the dealer dashboard   renders the editor canvas, and drives GrapesJS from
//                          the same node definitions the build uses
//   the Vendure plugin     imports the schemas, to validate what the AI returns
//                          before any of it is committed
//
// The vocabulary is one tree: section, row, column, contentArea, and widgets as
// leaves. GrapesJS registers one component type per layout node, the AI contract
// is generated from the same table, and `renderDocument` is what turns it into
// HTML. There is no translation layer between the three.
//
// Zero runtime dependencies, ESM, Node 20 and modern browsers. It is imported by
// a zero-dependency static build, so it may not add a bundler requirement to it.

export const RENDERER_VERSION = '4.0.0';

export { esc, attrs, tagAttrs, heading, image, join, cls, href, isExternal } from './html.mjs';
export { compileTokens, compileTokenScope, fontsHref, withDefaults, DEFAULT_TOKENS, TOKEN_GROUPS } from './tokens.mjs';

/* ------------------------------------------------------------- the document */

export {
  DOCUMENT_VERSION,
  LAYOUT_TYPES,
  CONTAINER_TYPES,
  GRID_COLUMNS,
  LAYOUT_REGISTRY,
  ROW_PRESETS,
  accepts,
  ensureIds,
  getLayout,
  isContainer,
  isLayout,
  layoutCatalogue,
  locateNode,
  makeRow,
  makeSection,
  nextNodeId,
  nodeIds,
  parseDocument,
  renderDocument,
  walkNodes,
} from './nodes.mjs';

/* ----------------------------------------------------------------- widgets */

export {
  blockRegistry,
  blockCatalogue,
  getBlock,
  resolveCta,
  registerCustomWidgets,
  clearCustomWidgets,
  customWidgets,
  customWidgetCss,
  defaultPropsFor,
  allWidgetIds,
  widgetIds,
  WIDGET_GROUPS,
} from './blocks.mjs';

export {
  parseWidgetDefinition,
  compileWidget,
  compileWidgets,
  compileTemplate,
  widgetSchema,
  defaultProps as widgetDefaultProps,
  scopeCss,
  stripUnsafeHtml,
  stripUnsafeCss,
  declaresSlots,
  isAutoTagged,
  emptyDefinition,
  PROP_TYPES,
} from './custom-widgets.mjs';

export { renderForm, operatorsForFieldType, FIELD_TYPES } from './forms.mjs';
export { renderWidget, staticWidgetIds, BEHAVIOUR_ONLY } from './widgets.mjs';

/* -------------------------------------------------------- menus + templates */

export { renderMenu, injectMenus, parseMenus, listMenus, emptyMenu, MENU_ITEM_TYPES, MAX_MENU_DEPTH } from './menus.mjs';

export {
  TEMPLATE_VERSION,
  CONDITION_TYPES,
  composeDocument,
  conditionMatches,
  describeCondition,
  findContentArea,
  hasContentArea,
  parseTemplate,
  parseTemplates,
  resolveTemplate,
  splitAtContentArea,
  starterTemplate,
  templatePath,
} from './templates.mjs';

/* ----------------------------------------------------- shell, checks, edits */

export { renderShell, businessJsonLd, analyticsTag } from './shell.mjs';
export { validateDocument, validateNode, validateTemplate, getDefinition } from './validate.mjs';
export { applyOps } from './ops.mjs';
