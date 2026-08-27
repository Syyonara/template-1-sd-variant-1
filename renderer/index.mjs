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

// 4.8.0 — `postsList` block: the latest published posts, resolved at build time
// from ctx.posts so a teaser never goes stale; and half-bleed section widths
// (`bleed-left` / `bleed-right`) — one side on the page grid, the other running
// to the screen edge, the split-section pattern every marketing homepage uses.
//
// 4.7.0 — `documentStyles` compiles instance style overrides for a document and
// for every designed component it places. `compileNodeStyles` sees only the nodes
// it is given, and a page holds a component as one reference node, so anything
// styled inside a component rendered unstyled on every page that placed it.
//
// 4.6.0 — designed components take placeholders. A component declares `props`,
// its nodes bind to them with `{{key}}`, a node can `repeat` over a list prop, and
// a `sharedSection` placing it supplies `values`. Until now a reusable component
// was identical everywhere it appeared, which is reuse in name only: the same
// carousel with different logos meant a second copy of the carousel.
//
// 4.5.0 — behaviour, behaviourOptions and part are props on every node, so an
// interactive component can be a tree the canvas builds rather than markup a
// person or a model hand-writes. `anchor` and `scope` join them as declared
// universal props: the renderer always read those off any node's wrapper while no
// widget declared them, so the validator refused edits the build would render.
export const RENDERER_VERSION = '4.9.0';

export {
  BEHAVIOURS,
  BEHAVIOUR_PARTS,
  BEHAVIOUR_OPTIONS,
  PARTS,
  behaviourAttrs,
} from './behaviours.mjs';

export {
  bindTree,
  bindingsUsed,
  componentSampleValues,
  componentValues,
  isBinding,
  parseComponentProps,
  previewProps,
} from './component-props.mjs';

export { componentCode, documentStyles } from './document-assets.mjs';
export { esc, attrs, tagAttrs, heading, image, join, cls, href, isExternal } from './html.mjs';
export {
  STYLE_FIELDS,
  STYLE_BUCKETS,
  STYLE_GROUPS,
  sanitizeStyles,
  unknownStyleKeys,
  compileNodeStyles,
} from './styles.mjs';
export {
  compileTokens,
  compileTokenScope,
  fontFaceCss,
  fontFiles,
  fontPreloads,
  fontsHref,
  withDefaults,
  DEFAULT_TOKENS,
  TOKEN_GROUPS,
} from './tokens.mjs';

/* ------------------------------------------------------------- the document */

export {
  DOCUMENT_VERSION,
  LAYOUT_TYPES,
  CONTAINER_TYPES,
  GRID_COLUMNS,
  LAYOUT_REGISTRY,
  UNIVERSAL_PROPS,
  BEHAVIOUR_PROPS,
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
  previewProps as widgetPreviewProps,
  renderWidgetPreview,
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
