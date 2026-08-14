// @buzznerd/site-renderer — the single source of truth for turning a dealer's
// site data into HTML.
//
// Two consumers must produce identical output from it: `scripts/build.mjs` at
// build time on Vercel, and the dealer dashboard's editor canvas. A third, the
// Vendure plugin, imports only the schemas, to validate what the AI returns
// before it is ever committed.
//
// Zero runtime dependencies, ESM, Node 20 and modern browsers. It is imported by
// a zero-dependency static build, so it may not add a bundler requirement to it.

export const RENDERER_VERSION = '2.0.0';

export { esc, attrs, tagAttrs, heading, image, join, cls, href, isExternal } from './html.mjs';
export { compileTokens, compileTokenScope, fontsHref, TOKEN_GROUPS } from './tokens.mjs';
export {
  blockRegistry,
  blockCatalogue,
  getBlock,
  resolveCta,
  CONTENT_BLOCK_TYPES,
  SECTION_BLOCK_TYPES,
  LAYOUT_BLOCK_TYPES,
} from './blocks.mjs';
export { renderPage, parsePage, walkBlocks, blockIds } from './page.mjs';
export { renderForm, operatorsForFieldType, FIELD_TYPES } from './forms.mjs';
export { renderWidget, staticWidgetIds, BEHAVIOUR_ONLY } from './widgets.mjs';
export { renderMenu, injectMenus, MENU_LOCATIONS } from './menus.mjs';
export { renderShell, businessJsonLd, analyticsTag } from './shell.mjs';
export { resolveTemplates, chromeCombinations, templatePath, SLOTS } from './templates.mjs';
export { validatePage, validateBlock } from './validate.mjs';
export { applyOps } from './ops.mjs';
