#!/usr/bin/env node
// Validate everything under site/ against the renderer's own rules.
//
// This exists because a dealer site can be authored by something that is not the
// dashboard — an agent turning a design handoff into a repo, a person editing
// JSON by hand — and a mistake in that JSON is otherwise found in one of two bad
// places: the Vercel build log, or the dashboard rendering a hole where a section
// should be.
//
// The rules are not restated here. Every check calls the same function the
// editor, the build and the backend validator call, which is the only way a
// "valid" verdict here can mean anything at all. What this script owns is
// coverage — every file, every cross-reference — and the wording of the
// failure, which has to name the file, the path inside it and the fix.
//
//   node scripts/validate.mjs            report, exit 1 on errors
//   node scripts/validate.mjs --quiet    only failures
//
// Cross-file references are where hand-authored sites actually break, and no
// single-file validator can see them: a page whose `templates.header` names a
// template that was renamed, a menu item pointing at a deleted page, a `form`
// block naming a form nobody created. Those are checked here.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONDITION_TYPES,
  MENU_ITEM_TYPES,
  RENDERER_VERSION,
  allWidgetIds,
  blockCatalogue,
  listMenus,
  parseMenus,
  parseTemplate,
  parseWidgetDefinition,
  registerCustomWidgets,
  validateDocument,
  validateTemplate,
} from '../renderer/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const QUIET = process.argv.includes('--quiet');

const problems = [];
const notes = [];
/** @param {string} file @param {string} where @param {string} message @param {string} [fix] */
const fail = (file, where, message, fix) => problems.push({ file, where, message, fix });
const note = (file, message) => notes.push({ file, message });

const readJson = (path) => {
  const raw = readFileSync(path, 'utf8');
  try {
    return { value: JSON.parse(raw) };
  } catch (err) {
    return { error: err.message };
  }
};
const rel = (path) => relative(ROOT, path);
const listJson = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];

/* ------------------------------------------------------- custom widgets first */
// Registered before any document is validated: a page placing this site's own
// widget is only valid once the renderer knows that widget exists, and a
// validator run in the wrong order reports every such page as broken.

const widgetDefs = [];
for (const file of listJson(join(SITE, 'widgets'))) {
  const path = join(SITE, 'widgets', file);
  const { value, error } = readJson(path);
  if (error) {
    fail(rel(path), '', `not valid JSON — ${error}`);
    continue;
  }
  const { definition, errors } = parseWidgetDefinition(value, file.replace(/\.json$/, ''));
  for (const message of errors) fail(rel(path), '', message);
  if (definition) widgetDefs.push(definition);
}
registerCustomWidgets(widgetDefs, (message) => note('site/widgets/', message));

const knownTypes = new Set([...allWidgetIds(), 'section', 'row', 'column', 'contentArea', 'sharedSection']);

/* ------------------------------------------------------------------- tokens */

const tokensPath = join(SITE, 'tokens.json');
if (!existsSync(tokensPath)) {
  fail('site/tokens.json', '', 'missing', 'Copy it from the template — every block is styled from it.');
} else {
  const { value, error } = readJson(tokensPath);
  if (error) fail('site/tokens.json', '', `not valid JSON — ${error}`);
  else if (!value?.colors?.accent) {
    note('site/tokens.json', 'no colors.accent — the starter palette will be used for anything unset');
  }
}

/* --------------------------------------------------------------- the library */

const forms = new Set();
for (const file of listJson(join(SITE, 'forms'))) {
  const path = join(SITE, 'forms', file);
  const { value, error } = readJson(path);
  if (error) {
    fail(rel(path), '', `not valid JSON — ${error}`);
    continue;
  }
  const id = value?.id ?? file.replace(/\.json$/, '');
  forms.add(id);
  if (value?.id && value.id !== file.replace(/\.json$/, '')) {
    fail(rel(path), 'id', `is "${value.id}" but the file is named "${file}"`, 'Make the filename match the id.');
  }
  if (!Array.isArray(value?.fields) || !value.fields.length) {
    fail(rel(path), 'fields', 'a form with no fields renders as a bare submit button');
  }
  for (const [i, field] of (value?.fields ?? []).entries()) {
    if (!field?.id) fail(rel(path), `fields[${i}].id`, 'every field needs a stable id');
    if (!field?.type) fail(rel(path), `fields[${i}].type`, 'every field needs a type');
  }
}

const buttons = new Set();
const buttonsPath = join(SITE, 'buttons.json');
if (existsSync(buttonsPath)) {
  const { value, error } = readJson(buttonsPath);
  if (error) fail('site/buttons.json', '', `not valid JSON — ${error}`);
  else {
    const list = Array.isArray(value) ? value : (value?.buttons ?? []);
    for (const [i, button] of list.entries()) {
      if (!button?.id) fail('site/buttons.json', `[${i}].id`, 'every button needs an id');
      else buttons.add(button.id);
      if (!button?.url && !button?.formId) {
        fail('site/buttons.json', `[${i}]`, `"${button?.id ?? i}" has neither url nor formId — it links nowhere`);
      }
      if (button?.formId && !forms.has(button.formId)) {
        fail('site/buttons.json', `[${i}].formId`, `no form called "${button.formId}"`);
      }
    }
  }
}

/* ---------------------------------------------------------------- the pages */

const pagesPath = join(SITE, 'pages.json');
const pages = [];
if (!existsSync(pagesPath)) {
  fail('site/pages.json', '', 'missing', 'The manifest is what the dashboard lists; without it there are no pages.');
} else {
  const { value, error } = readJson(pagesPath);
  if (error) {
    fail('site/pages.json', '', `not valid JSON — ${error}`);
  } else {
    const list = Array.isArray(value) ? value : (value?.pages ?? []);
    if (!Array.isArray(list)) {
      fail('site/pages.json', '', 'must be an array of pages (or { "pages": [...] })');
    } else {
      const slugs = new Set();
      const paths = new Set();
      for (const [i, page] of list.entries()) {
        const at = `[${i}]`;
        for (const key of ['slug', 'title', 'path', 'out', 'dir']) {
          if (!page?.[key]) fail('site/pages.json', `${at}.${key}`, 'is required');
        }
        if (page?.slug) {
          if (slugs.has(page.slug)) fail('site/pages.json', `${at}.slug`, `"${page.slug}" appears twice`);
          slugs.add(page.slug);
        }
        if (page?.path) {
          if (paths.has(page.path)) fail('site/pages.json', `${at}.path`, `"${page.path}" appears twice`);
          paths.add(page.path);
        }
        // `path` is the address a visitor types; `out` is the file written for it.
        // They are separate fields and nothing else checks that they agree, so a
        // page can be listed at /financing and written to about/index.html.
        if (page?.path && page?.out) {
          const expected =
            page.path === '/' ? 'index.html' : `${page.path.replace(/^\/+|\/+$/g, '')}/index.html`;
          if (page.out !== expected) {
            fail(
              'site/pages.json',
              `${at}.out`,
              `is "${page.out}" but path "${page.path}" builds to "${expected}"`,
              `Set out to "${expected}".`,
            );
          }
        }
        if (page?.dir) pages.push(page);
      }
    }
  }
}

const CONDITION_IDS = CONDITION_TYPES.map(c => c.id);
const pageSlugs = new Set(pages.map(p => p.slug));
let sitewideTemplate = false;

/* ----------------------------------------------------------- page documents */

const templateIds = new Set();
for (const file of listJson(join(SITE, 'templates'))) {
  const path = join(SITE, 'templates', file);
  const { value, error } = readJson(path);
  if (error) {
    fail(rel(path), '', `not valid JSON — ${error}`);
    continue;
  }
  const id = file.replace(/\.json$/, '');
  const parsed = parseTemplate(value, id);
  if (!parsed) {
    fail(rel(path), '', 'could not be read as a template');
    continue;
  }
  templateIds.add(parsed.id);
  // Display conditions decide which pages a template wraps, and an unrecognised
  // type simply never matches — so the template builds, validates, and silently
  // appears on nothing. That is the most expensive kind of mistake here: the
  // header exists in the repo and on no page, with nothing to explain it.
  const conditions = Array.isArray(value?.conditions) ? value.conditions : [];
  if (!conditions.length) {
    fail(
      rel(path),
      'conditions',
      'has no display conditions, so it wraps no pages',
      `Add one, e.g. { "type": "entireSite" }. Types: ${CONDITION_IDS.join(', ')}.`,
    );
  }
  for (const [i, condition] of conditions.entries()) {
    if (!CONDITION_IDS.includes(condition?.type)) {
      fail(
        rel(path),
        `conditions[${i}].type`,
        `"${condition?.type}" is not a display condition, so this template matches nothing`,
        `One of: ${CONDITION_IDS.join(', ')}.`,
      );
      continue;
    }
    const spec = CONDITION_TYPES.find(c => c.id === condition.type);
    if (spec?.ref && !condition.ref) {
      fail(rel(path), `conditions[${i}].ref`, `a "${condition.type}" condition needs a ref`);
    }
    if (spec?.ref === 'page' && condition.ref && !pageSlugs.has(condition.ref)) {
      fail(rel(path), `conditions[${i}].ref`, `no page with slug "${condition.ref}"`);
    }
    if (['entireSite', 'allPages'].includes(condition.type)) sitewideTemplate = true;
  }
  const { errors, warnings } = validateTemplate(value);
  for (const issue of errors) fail(rel(path), issue.path, issue.message);
  for (const issue of warnings) note(rel(path), `${issue.path}: ${issue.message}`);
  reportUnknownTypes(rel(path), parsed.nodes);
}

for (const page of pages) {
  const path = join(SITE, 'pages', page.dir, 'page.json');
  if (!existsSync(path)) {
    // A repo written before the block model may still carry body.html, and the
    // build supports it — but the dashboard cannot edit it on the canvas.
    if (existsSync(join(SITE, 'pages', page.dir, 'body.html'))) {
      note(
        `site/pages/${page.dir}/`,
        'has body.html and no page.json — it builds, but the editor shows a conversion banner instead of a canvas',
      );
    } else {
      fail(
        `site/pages/${page.dir}/page.json`,
        '',
        `missing, but site/pages.json lists the page "${page.slug}"`,
        'Write { "version": 2, "nodes": [] } and build the page up from there.',
      );
    }
    continue;
  }
  const { value, error } = readJson(path);
  if (error) {
    fail(rel(path), '', `not valid JSON — ${error}`);
    continue;
  }
  const { errors, warnings } = validateDocument(value);
  for (const issue of errors) fail(rel(path), issue.path, issue.message);
  for (const issue of warnings) note(rel(path), `${issue.path}: ${issue.message}`);
  reportUnknownTypes(rel(path), value?.nodes ?? []);
  checkReferences(rel(path), value?.nodes ?? []);

  for (const [slot, id] of Object.entries(page.templates ?? {})) {
    if (id && !templateIds.has(id)) {
      fail('site/pages.json', `${page.slug}.templates.${slot}`, `no template called "${id}"`);
    }
  }
}

/* ---------------------------------------------------- sections (components) */

const sectionIds = new Set();
for (const file of listJson(join(SITE, 'sections'))) {
  const path = join(SITE, 'sections', file);
  const { value, error } = readJson(path);
  if (error) {
    fail(rel(path), '', `not valid JSON — ${error}`);
    continue;
  }
  const id = value?.id ?? file.replace(/\.json$/, '');
  sectionIds.add(id);
  if (value?.id && value.id !== file.replace(/\.json$/, '')) {
    fail(rel(path), 'id', `is "${value.id}" but the file is named "${file}"`);
  }
  const { errors, warnings } = validateDocument(value);
  for (const issue of errors) fail(rel(path), issue.path, issue.message);
  for (const issue of warnings) note(rel(path), `${issue.path}: ${issue.message}`);
  reportUnknownTypes(rel(path), value?.nodes ?? []);
  checkReferences(rel(path), value?.nodes ?? []);
}

/* --------------------------------------------------------------------- blog */

for (const file of listJson(join(SITE, 'blog', 'posts'))) {
  const path = join(SITE, 'blog', 'posts', file);
  const { value, error } = readJson(path);
  if (error) {
    fail(rel(path), '', `not valid JSON — ${error}`);
    continue;
  }
  if (!value?.slug) fail(rel(path), 'slug', 'is required');
  if (!value?.title) fail(rel(path), 'title', 'is required');
  if (!value?.date) note(rel(path), 'no date — posts are ordered by date, so this one sorts last');
  if (value?.nodes || value?.blocks) {
    const { errors } = validateDocument(value);
    for (const issue of errors) fail(rel(path), issue.path, issue.message);
    reportUnknownTypes(rel(path), value.nodes ?? value.blocks ?? []);
  }
}

/* -------------------------------------------------------------------- menus */

const menusPath = join(SITE, 'menus.json');
if (existsSync(menusPath)) {
  const { value, error } = readJson(menusPath);
  if (error) {
    fail('site/menus.json', '', `not valid JSON — ${error}`);
  } else {
    const menus = listMenus(parseMenus(value));
    const seen = new Set();
    for (const menu of menus) {
      if (seen.has(menu.id)) fail('site/menus.json', menu.id, 'two menus share this id');
      seen.add(menu.id);
      const walk = (items, where) => {
        for (const [i, item] of (items ?? []).entries()) {
          const at = `${where}[${i}]`;
          if (!item?.label) fail('site/menus.json', at, 'every item needs a label');
          if (item?.type && !MENU_ITEM_TYPES.includes(item.type)) {
            fail('site/menus.json', `${at}.type`, `"${item.type}" is not one of ${MENU_ITEM_TYPES.join(', ')}`);
          }
          if (item?.type === 'page' && item.ref && !pageSlugs.has(item.ref)) {
            fail('site/menus.json', `${at}.ref`, `no page with slug "${item.ref}"`, 'Menu items point at a page by slug, not by address.');
          }
          if (item?.type === 'url' && !item.url) fail('site/menus.json', `${at}.url`, 'a url item needs a url');
          walk(item?.children, `${at}.children`);
        }
      };
      walk(menu.items, `${menu.id}.items`);
    }
  }
}

// A site whose pages match no template renders with no header and no footer.
// Legal — a one-page site may want that — but almost never intended.
if (templateIds.size && !sitewideTemplate) {
  note(
    'site/templates/',
    'no template has an entireSite or allPages condition, so any page not matched by a more specific one renders with no header or footer',
  );
}

/* ------------------------------------------------- can the platform adopt it? */
// The dashboard refuses to connect a repo that is not a dealer site, and it
// checks exactly these four files. Checking them here means an author finds out
// before pushing rather than from a refusal in the UI.

for (const path of ['renderer/index.mjs', 'scripts/build.mjs', 'dealer.config.json', 'vercel.json']) {
  if (!existsSync(join(ROOT, path))) {
    fail(
      path,
      '',
      'missing — the dashboard will refuse to connect this repo',
      'Generate the repo from the site template rather than building the tree by hand.',
    );
  }
}

const configPath = join(ROOT, 'dealer.config.json');
if (existsSync(configPath)) {
  const { value, error } = readJson(configPath);
  if (error) {
    fail('dealer.config.json', '', `not valid JSON — ${error}`);
  } else {
    for (const key of ['name', 'business', 'seo']) {
      if (!value?.[key]) fail('dealer.config.json', key, 'is required');
    }
    // Placeholders are correct before adoption: the platform writes the channel
    // token, domain and storefront origin when the channel connects the repo.
    if (JSON.stringify(value).includes('REPLACE_')) {
      note(
        'dealer.config.json',
        'still carries REPLACE_ placeholders — right, if this repo has not been connected to a channel yet. The platform fills them in on connect.',
      );
    }
  }
}

/* ------------------------------------------------------------------ helpers */

function eachNode(nodes, visit, path = 'nodes') {
  for (const [i, node] of (nodes ?? []).entries()) {
    const at = `${path}[${i}]`;
    if (node && typeof node === 'object') {
      visit(node, at);
      if (Array.isArray(node.children)) eachNode(node.children, visit, `${at}.children`);
    }
  }
}

/**
 * A node type nothing can render.
 *
 * Called out separately from schema validation because the failure mode is the
 * quietest one in the system: the renderer skips an unknown type with a warning,
 * so the page builds, deploys and simply has a hole where the section was.
 */
function reportUnknownTypes(file, nodes) {
  eachNode(nodes, (node, at) => {
    if (!node.type) {
      fail(file, at, 'has no type');
      return;
    }
    if (!knownTypes.has(node.type)) {
      fail(
        file,
        `${at}.type`,
        `"${node.type}" is not a block this renderer has`,
        'Run `npm run schemas` and pick an id from renderer/block-schemas.json, or author it as a custom widget under site/widgets/.',
      );
    }
  });
}

/** Library ids a node points at, which no schema can check. */
function checkReferences(file, nodes) {
  eachNode(nodes, (node, at) => {
    const props = node.props ?? {};
    if (node.type === 'form' && props.formId && !forms.has(props.formId)) {
      fail(file, `${at}.props.formId`, `no form called "${props.formId}"`);
    }
    if (node.type === 'sharedSection' && props.sectionId && !sectionIds.has(props.sectionId)) {
      fail(file, `${at}.props.sectionId`, `no component called "${props.sectionId}"`);
    }
    for (const [i, item] of (props.items ?? []).entries()) {
      if (item?.ctaId && !buttons.has(item.ctaId)) {
        fail(file, `${at}.props.items[${i}].ctaId`, `no button called "${item.ctaId}"`);
      }
    }
    for (const [i, cta] of (props.ctas ?? []).entries()) {
      if (cta?.ctaId && !buttons.has(cta.ctaId)) {
        fail(file, `${at}.props.ctas[${i}].ctaId`, `no button called "${cta.ctaId}"`);
      }
    }
    if (props.cta?.ctaId && !buttons.has(props.cta.ctaId)) {
      fail(file, `${at}.props.cta.ctaId`, `no button called "${props.cta.ctaId}"`);
    }
  });
}

/* ------------------------------------------------------------------- report */

if (!QUIET) {
  const catalogue = blockCatalogue();
  console.log(`renderer ${RENDERER_VERSION} · ${catalogue.length} block types · ${pages.length} page(s)`);
  console.log(
    `libraries: ${forms.size} form(s), ${buttons.size} button(s), ${templateIds.size} template(s), ` +
      `${sectionIds.size} component(s), ${widgetDefs.length} custom widget(s)`,
  );
}

if (notes.length && !QUIET) {
  console.log(`\n${notes.length} note(s) — these build, but read them:`);
  for (const n of notes) console.log(`  · ${n.file}: ${n.message}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) {
    console.error(`  ✗ ${p.file}${p.where ? ` → ${p.where}` : ''}: ${p.message}`);
    if (p.fix) console.error(`      ${p.fix}`);
  }
  console.error('\nNothing was changed. Fix these and run `npm run validate` again.');
  process.exit(1);
}

console.log('\nsite/ is valid — the dashboard can open this repo and the build will render it.');
