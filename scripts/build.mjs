// build.mjs — zero-dependency assembler for the dealer brand site.
//
// It loads JSON, calls ../renderer, and writes files. That is the whole job: all
// compilation rules (tokens -> CSS, blocks -> HTML, menus -> nav, the document
// shell) live in the renderer, which the dealer dashboard imports too. Two copies
// of those rules would mean the editor canvas and the published page drift, and
// the drift only shows up on a live dealer site.
//
// A page's content is `site/pages/<dir>/page.json` — a block list. `body.html` is
// still read when there is no page.json, so repos provisioned before the block
// model keep building untouched.
//
// It deliberately does NOT write vercel.json (platform-owned; the dashboard bakes
// the per-dealer storefront origin into it at provisioning time).
//
// Run: node scripts/build.mjs  ->  dist/

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RENDERER_VERSION,
  chromeCombinations,
  compileTokens,
  compileTokenScope,
  fontsHref,
  injectMenus,
  renderPage,
  renderShell,
  resolveTemplates,
  SLOTS,
} from '../renderer/index.mjs';

const ROOT = process.cwd();
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');
const RENDERER = dirname(fileURLToPath(new URL('../renderer/index.mjs', import.meta.url)));

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readJsonIf = (p, fallback) => (existsSync(p) ? readJson(p) : fallback);
const readText = (p, fallback = '') => (existsSync(p) ? readFileSync(p, 'utf8') : fallback);

const config = readJson(join(ROOT, 'dealer.config.json'));
const tokens = readJson(join(SITE, 'tokens.json'));
const menus = readJson(join(SITE, 'menus.json'));
const pages = readJson(join(SITE, 'pages.json'));
const assignments = readJsonIf(join(SITE, 'assignments.json'), { defaults: {}, rules: [] });

const PREFIX = String(config.storefrontPrefix || 'store').replace(/^\/+|\/+$/g, '');

const warnings = [];
const warn = (m) => {
  if (!warnings.includes(m)) warnings.push(m);
};

/* --------------------------------------------------------- dealer libraries */
// Forms and Buttons are libraries, not per-page content: a page references one by
// id. That is what keeps a CTA's label, destination and tagging consistent
// wherever it appears, and keeps a form's validation, consent and routing in one
// place instead of re-invented per page by whoever edited it last.

function loadById(dir) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const entry = readJson(join(dir, file));
    const id = entry.id || file.replace(/\.json$/, '');
    out[id] = { ...entry, id };
  }
  return out;
}

const forms = loadById(join(SITE, 'forms'));

const buttons = (() => {
  const raw = readJsonIf(join(SITE, 'buttons.json'), []);
  const list = Array.isArray(raw) ? raw : raw.buttons || [];
  return Object.fromEntries(list.filter((b) => b && b.id).map((b) => [b.id, b]));
})();

/* ------------------------------------------------------------------- tokens */

const tokensCss = compileTokens(tokens);

// Scoped overrides: a brand page restyles within the same cascade rather than
// loading a second stylesheet, so unmentioned tokens keep their base values.
const tokenScopes = [];
const scopeDir = join(SITE, 'tokens');
if (existsSync(scopeDir)) {
  for (const file of readdirSync(scopeDir)) {
    if (!file.endsWith('.json')) continue;
    const scope = file.replace(/\.json$/, '');
    const { css, unknown } = compileTokenScope(scope, readJson(join(scopeDir, file)), tokens);
    for (const key of unknown) {
      warn(`tokens/${file} sets "${key}", which is not a base token key — ignored.`);
    }
    if (css) {
      tokenScopes.push(scope);
      write(`styles/tokens.${scope}.css`, css);
    }
  }
}

const FONTS_HREF = fontsHref(tokens);

/* ------------------------------------------------------------------- chrome */

const renderCtx = {
  storefrontPrefix: PREFIX,
  businessName: config.name,
  forms,
  buttons,
  menus,
  // Menu items point at a page by slug rather than by address, so the manifest
  // has to be in context for a link to resolve.
  pages,
  warn,
};

/**
 * Chrome for a slot. A template file (`site/templates/<slot>--<name>.json`) is a
 * block list, so header and footer are authored with the same blocks a page is —
 * one editor, one renderer, one set of tagging rules.
 *
 * The shipped default falls back to the hand-authored fragments in site/chrome/,
 * which is what every repo has before templates are used.
 */
function renderSlot(slot, templateId) {
  const path = join(SITE, 'templates', `${templateId}.json`);
  if (existsSync(path)) {
    // A template is a block list, so the header is rendered by the same code the
    // page is — and edited in the same canvas.
    return injectMenus(renderPage(readJson(path), renderCtx), menus, renderCtx);
  }
  // Repos provisioned before templates existed still carry hand-written chrome.
  // They keep working; the first edit in the editor writes a template instead.
  const legacy = join(SITE, 'chrome', `${slot}.html`);
  if (existsSync(legacy)) return injectMenus(readText(legacy), menus, renderCtx);
  return '';
}

const chromeCache = new Map();
function chromeFor(resolved) {
  const key = SLOTS.map((s) => resolved[s].templateId).join('|');
  if (!chromeCache.has(key)) {
    for (const slot of SLOTS) {
      if (resolved[slot].conflict) warn(`${slot}: ${resolved[slot].conflict}`);
    }
    chromeCache.set(key, {
      header: renderSlot('header', resolved.header.templateId),
      footer: renderSlot('footer', resolved.footer.templateId),
    });
  }
  return chromeCache.get(key);
}

const chromeCss = readText(join(SITE, 'chrome', 'chrome.css'));
const chromeJs = readText(join(SITE, 'chrome', 'chrome.js'));
const resetCss = readText(join(SITE, 'reset.css'));
const blocksCss = readText(join(RENDERER, 'blocks.css'));
const widgetsJs = readText(join(RENDERER, 'client', 'widgets.js'));

/* ------------------------------------------------------------------ writing */

function write(rel, contents) {
  const out = join(DIST, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, contents);
}

mkdirSync(DIST, { recursive: true });
write('styles/tokens.css', tokensCss);
write('styles/reset.css', resetCss);
write('styles/blocks.css', blocksCss);
write('styles/chrome.css', chromeCss);
write('scripts/chrome.js', chromeJs);
write('scripts/widgets.js', widgetsJs);

/* -------------------------------------------------------------------- pages */
// status: published -> emitted, indexed, in sitemap + llms.txt
//         draft     -> emitted (so previews work) but noindex and excluded
//         archived  -> not emitted at all

function pageBody(dir, slug) {
  const pageJsonPath = join(dir, 'page.json');
  if (existsSync(pageJsonPath)) {
    const html = renderPage(readJson(pageJsonPath), renderCtx);
    if (!html) warn(`page "${slug}" has a page.json with no renderable blocks`);
    return { html, source: 'blocks' };
  }
  const body = readText(join(dir, 'body.html'));
  if (!body) warn(`page "${slug}" has neither page.json nor body.html`);
  return { html: body, source: 'html' };
}

const emitted = [];
for (const p of pages) {
  const status = p.status || 'published';
  if (status === 'archived') continue;

  const dir = join(SITE, 'pages', p.dir);
  const { html: body } = pageBody(dir, p.slug);
  const css = readText(join(dir, 'style.css'));

  let pageJs = null;
  if (existsSync(join(dir, 'script.js'))) {
    pageJs = `/scripts/pages/${p.dir}.js`;
    write(`scripts/pages/${p.dir}.js`, readText(join(dir, 'script.js')));
  }

  const resolved = resolveTemplates({ route: p.path, kind: 'page', group: p.group }, p, assignments);
  const noindex = status !== 'published' || !!(p.seo && p.seo.noindex);

  write(
    p.out,
    renderShell({
      config,
      fontsHref: FONTS_HREF,
      chrome: chromeFor(resolved),
      storefrontPrefix: PREFIX,
      title: p.title,
      description: p.description || config.seo.defaultDescription,
      canonical: config.url + p.path,
      bodyHtml: body,
      pageCss: css,
      pageJs,
      ogImage: p.seo && p.seo.ogImage,
      noindex,
      tokenScopes: p.tokenScope ? [p.tokenScope] : [],
    }),
  );
  emitted.push({ ...p, status, noindex, resolved });
}

const indexable = emitted.filter((p) => !p.noindex);
const defaultChrome = chromeFor(
  resolveTemplates({ route: '/', kind: 'page' }, pages.find((p) => p.path === '/') || null, assignments),
);

/* ----------------------------------------------------------------- partials */
// Everything the Remix storefront needs to render inventory inside this site's
// chrome. reset.css, blocks.css and chrome.js are included because body
// typography, the public components and the mobile nav live there — without them
// the storefront renders unstyled chrome with a dead menu button.

write('partials/header.html', defaultChrome.header);
write('partials/footer.html', defaultChrome.footer);
write('partials/chrome.css', chromeCss);
write('partials/blocks.css', blocksCss);
write('partials/chrome.js', chromeJs);
write('partials/widgets.js', widgetsJs);
write('partials/reset.css', resetCss);
write('partials/tokens.css', tokensCss);
write('partials/fonts.txt', FONTS_HREF);

// One pre-rendered fragment per distinct chrome combination, plus a route table.
// Once chrome is conditional, a single header.html is insufficient: /store and a
// brand page can resolve to different headers.
const storefrontRoutes = [
  { route: `/${PREFIX}`, pattern: `/${PREFIX}`, kind: 'plp', isDefault: true },
  { route: `/${PREFIX}/*`, pattern: `/${PREFIX}/*`, kind: 'pdp', pdpType: 'listings' },
  ...emitted.map((p) => ({ route: p.path, pattern: p.path, kind: 'page', group: p.group })),
];
const { combos, table } = chromeCombinations(storefrontRoutes, pages, assignments);

const chromeManifest = {};
for (const [key, resolved] of combos) {
  const rendered = chromeFor(resolved);
  if (key !== 'default') {
    write(`partials/header--${key}.html`, rendered.header);
    write(`partials/footer--${key}.html`, rendered.footer);
  }
  chromeManifest[key] = {
    header: key === 'default' ? '/partials/header.html' : `/partials/header--${key}.html`,
    footer: key === 'default' ? '/partials/footer.html' : `/partials/footer--${key}.html`,
    styles: ['/partials/tokens.css', '/partials/reset.css', '/partials/blocks.css', '/partials/chrome.css'],
    scripts: ['/partials/chrome.js', '/partials/widgets.js'],
    templates: Object.fromEntries(SLOTS.map((s) => [s, resolved[s].templateId])),
  };
}

write(
  'partials/manifest.json',
  JSON.stringify(
    {
      contractVersion: config.contractVersion,
      rendererVersion: RENDERER_VERSION,
      generatedAt: new Date().toISOString(),
      channelToken: config.channelToken,
      storefrontPrefix: PREFIX,
      fontsHref: FONTS_HREF,
      chrome: chromeManifest,
      routes: table,
    },
    null,
    2,
  ) + '\n',
);

/* --------------------------------------------------------------------- blog */

const BLOG = join(SITE, 'blog');
const posts = [];
if (existsSync(join(BLOG, 'posts'))) {
  const settings = readJsonIf(join(BLOG, 'settings.json'), {
    enabled: true,
    basePath: '/blog',
    title: 'News',
    description: '',
  });

  if (settings.enabled) {
    const base = String(settings.basePath || '/blog').replace(/\/$/, '');
    for (const f of readdirSync(join(BLOG, 'posts'))) {
      if (!f.endsWith('.json')) continue;
      const post = readJson(join(BLOG, 'posts', f));
      if ((post.status || 'published') !== 'published') continue;
      posts.push(post);
    }
    posts.sort((a, b) => (a.date < b.date ? 1 : -1));

    // A post authored as blocks renders through the same path a page does; the
    // legacy `body` string stays supported so existing posts keep working.
    const postBody = (post) =>
      post.blocks
        ? renderPage({ blocks: post.blocks }, renderCtx)
        : `<div class="bz-container bz-prose">${post.body || ''}</div>`;

    for (const post of posts) {
      write(
        `${base.slice(1)}/${post.slug}/index.html`,
        renderShell({
          config,
          fontsHref: FONTS_HREF,
          chrome: defaultChrome,
          storefrontPrefix: PREFIX,
          title: post.title,
          description: post.description || config.seo.defaultDescription,
          canonical: `${config.url}${base}/${post.slug}`,
          bodyHtml: `<article class="bz-block">
  <div class="bz-container bz-prose">
    <p class="bz-eyebrow">${new Date(post.date).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
    <h1>${post.title}</h1>
  </div>
  ${post.coverImage ? `<div class="bz-container"><img src="${post.coverImage}" alt="" width="1200" height="630" loading="eager" /></div>` : ''}
  ${postBody(post)}
</article>`,
          pageCss: '',
          pageJs: null,
          ogImage: post.coverImage,
          noindex: false,
        }),
      );
    }

    write(
      `${base.slice(1)}/index.html`,
      renderShell({
        config,
        fontsHref: FONTS_HREF,
        chrome: defaultChrome,
        storefrontPrefix: PREFIX,
        title: settings.title,
        description: settings.description || config.seo.defaultDescription,
        canonical: config.url + base,
        bodyHtml: `<section class="bz-block"><div class="bz-container">
  <h1>${settings.title}</h1>
  <p class="bz-lede">${settings.description || ''}</p>
  <ul class="bz-bare">
${posts
  .map(
    (p) =>
      `    <li class="bz-loc"><a href="${base}/${p.slug}"><strong>${p.title}</strong></a><span class="bz-loc__s">${p.description || ''}</span></li>`,
  )
  .join('\n')}
  </ul>
</div></section>`,
        pageCss: '',
        pageJs: null,
        ogImage: null,
        noindex: false,
      }),
    );
  }
}

/* ------------------------------------------------------------------ sitemap */

const blogBase = posts.length ? '/blog' : null;
const sitemapUrls = indexable
  .map((p) => config.url + p.path)
  .concat(posts.map((p) => `${config.url}${blogBase}/${p.slug}`))
  .concat(blogBase ? [config.url + blogBase] : [])
  .concat([`${config.url}/${PREFIX}`]);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemapUrls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') +
    `\n</urlset>\n`,
);

write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`);

/* ---------------------------------------------------------------- llms.txt */

const biz = config.business;
write(
  'llms.txt',
  `# ${config.name}
> ${config.seo.defaultDescription}

${config.name} is a ${biz.type} in ${biz.addressLocality}, ${biz.addressRegion}.
Phone: ${biz.phone}. Address: ${biz.streetAddress}, ${biz.addressLocality}, ${biz.addressRegion} ${biz.postalCode}.
Hours: ${biz.openingHours.join('; ')}.

## Pages
${indexable.map((p) => `- [${p.title}](${config.url}${p.path}): ${p.description || ''}`).join('\n')}

${posts.length ? `## Posts\n${posts.map((p) => `- [${p.title}](${config.url}/blog/${p.slug}): ${p.description || ''}`).join('\n')}\n` : ''}
## Inventory
- Browse live inventory, pricing and availability: ${config.url}/${PREFIX}
`,
);

/* -------------------------------------------------------------- public/* */
if (existsSync(join(ROOT, 'public'))) cpSync(join(ROOT, 'public'), DIST, { recursive: true });

/* ----------------------------------------------------------------- report */
for (const w of warnings) console.warn(`  warn: ${w}`);
console.log(
  `Built ${emitted.length} page(s) (${indexable.length} indexable), ${Object.keys(forms).length} form(s), ` +
    `${combos.size} chrome combination(s) + sitemap/robots/llms.txt -> dist/  ` +
    `[prefix: /${PREFIX}, renderer ${RENDERER_VERSION}]`,
);
