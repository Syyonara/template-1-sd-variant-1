// build.mjs — zero-dependency assembler for the dealer brand site.
//
// It does NOT run GrapesJS and does NOT re-render page bodies. The dashboard
// exports each page's final HTML/CSS/JS (and the shared chrome) at publish and
// commits them under site/. This script assembles: tokens.json -> CSS custom
// properties, menus.json -> rendered <nav> markup, then wraps each page body in
// <head> + shared chrome, injects SEO + JSON-LD + the optional analytics loader,
// and emits sitemap, robots, llms.txt and the /partials/* bundle the Remix
// storefront wraps inventory in.
//
// It deliberately does NOT write vercel.json (platform-owned; the dashboard
// bakes the per-dealer storefront origin into it at provisioning time).
//
// Run: node scripts/build.mjs  ->  dist/

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.cwd();
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readText = (p, fallback = '') => (existsSync(p) ? readFileSync(p, 'utf8') : fallback);

const config = readJson(join(ROOT, 'dealer.config.json'));
const tokens = readJson(join(SITE, 'tokens.json'));
const menus = readJson(join(SITE, 'menus.json'));
const pages = readJson(join(SITE, 'pages.json'));

const biz = config.business;
const PREFIX = String(config.storefrontPrefix || 'store').replace(/^\/+|\/+$/g, '');

const warnings = [];
const warn = (m) => warnings.push(m);

/* ------------------------------------------------------------------ tokens */
// tokens.json is the single editable source for the design system. Everything
// here is derived from it; nothing is hardcoded that a dealer can change.
// A fixed extension layer (neutral ramp, wide type/space scales, shadows) is
// appended so page CSS written against the older vocabulary keeps working.

const px = (n) => `${n}px`;
const rem = (n) => `${(Number(n) / 16).toFixed(4).replace(/\.?0+$/, '')}rem`;

function buildTokensCss(t) {
  const c = t.colors, s = t.status, ty = t.type, sp = t.spacing, r = t.radius, f = t.fonts;
  return `:root {
  /* Fonts — editable */
  --font-heading:"${f.heading}",system-ui,sans-serif;
  --font-body:"${f.body}",system-ui,sans-serif;

  /* Colors — editable */
  --accent:${c.accent}; --accent-dark:${c.accentDark};
  --ink:${c.ink}; --ink-dark:${c.inkDark};
  --muted:${c.muted}; --line:${c.line}; --card:${c.card}; --paper:${c.paper};

  /* Status — editable */
  --ok:${s.ok}; --info:${s.info}; --warn:${s.warn}; --bad:${s.bad};

  /* Type scale — editable */
  --text-h1:${rem(ty.h1)}; --text-h2:${rem(ty.h2)}; --text-h3:${rem(ty.h3)};
  --text-body:${rem(ty.body)}; --text-small:${rem(ty.small)}; --text-eyebrow:${rem(ty.eyebrow)};

  /* Spacing scale — editable */
  --space-1:${px(sp['1'])}; --space-2:${px(sp['2'])}; --space-3:${px(sp['3'])};
  --space-4:${px(sp['4'])}; --space-5:${px(sp['5'])}; --space-6:${px(sp['6'])}; --space-7:${px(sp['7'])};

  /* Radius by role — editable */
  --radius-nav:${px(r.nav)}; --radius-input:${px(r.input)}; --radius-card:${px(r.card)};
  --radius-modal:${px(r.modal)}; --radius-chip:${px(r.chip)};

  /* Layout — editable */
  --container:${t.layout.container};

  /* ---- Fixed extension layer (not dealer-editable) ---- */
  --gray-50:#f8fafc; --gray-100:#f1f5f9; --gray-200:#e2e8f0; --gray-300:#cbd5e1; --gray-400:#94a3b8;
  --gray-500:#64748b; --gray-600:#475569; --gray-700:#334155; --gray-800:#1e293b; --gray-900:#0f172a; --gray-950:#020617;
  --space-8:64px; --space-9:80px; --space-10:96px;
  --shadow-sm:0 1px 2px rgba(15,23,42,.06); --shadow-md:0 4px 12px rgba(15,23,42,.08);
  --shadow-lg:0 12px 32px rgba(15,23,42,.10); --shadow-2xl:0 18px 50px rgba(15,23,42,.12);
  --shadow:var(--shadow-2xl);

  /* ---- Back-compat aliases (v1 vocabulary; do not author new CSS against these) ---- */
  --primary:var(--ink); --primary-dark:var(--ink-dark); --text:var(--ink);
  --bg:var(--paper); --surface:var(--card); --border:var(--line);
  --radius:var(--radius-card); --radius-full:var(--radius-chip);
}
`;
}

/* ------------------------------------------------------------------- menus */
// Menus live in site/menus.json and are injected into the chrome at build time
// via <!-- menu:<location> --> markers. Nav is never hand-written into
// header.html, so one edit updates every page and the storefront partials.

function renderMenu(location) {
  const menu = menus[location];
  if (!menu) {
    warn(`menus.json has no location "${location}" — referenced by the chrome.`);
    return '';
  }
  return (menu.items || [])
    .map((i) => {
      const ext = /^https?:/i.test(i.href) ? ' rel="noopener"' : '';
      return `<a href="${i.href}" data-bz-menu-item="${location}"${ext}>${i.label}</a>`;
    })
    .join('\n      ');
}

function injectMenus(html) {
  return html.replace(/<!--\s*menu:([a-z0-9-]+)\s*-->/gi, (_, loc) => renderMenu(loc));
}

/* ----------------------------------------------------------------- sources */
const headerHtml = injectMenus(readText(join(SITE, 'chrome', 'header.html')));
const footerHtml = injectMenus(readText(join(SITE, 'chrome', 'footer.html')));
const chromeCss = readText(join(SITE, 'chrome', 'chrome.css'));
const chromeJs = readText(join(SITE, 'chrome', 'chrome.js'));
const resetCss = readText(join(SITE, 'reset.css'));
const tokensCss = buildTokensCss(tokens);

function fontsHref() {
  const fams = [...new Set([tokens.fonts.heading, tokens.fonts.body])]
    .map((f) => encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;600;700;800')
    .join('&family=');
  return `https://fonts.googleapis.com/css2?family=${fams}&display=swap`;
}

function businessJsonLd() {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': biz.type,
    name: config.name,
    legalName: biz.legalName,
    url: config.url,
    telephone: biz.phone,
    email: biz.email,
    image: config.url + config.seo.ogImage,
    address: {
      '@type': 'PostalAddress',
      streetAddress: biz.streetAddress,
      addressLocality: biz.addressLocality,
      addressRegion: biz.addressRegion,
      postalCode: biz.postalCode,
      addressCountry: biz.addressCountry,
    },
    geo: { '@type': 'GeoCoordinates', latitude: biz.latitude, longitude: biz.longitude },
    openingHours: biz.openingHours,
    priceRange: biz.priceRange,
  });
}

/* ---------------------------------------------------------------- analytics */
// One versioned loader tag, pointed at a platform-hosted script. Never inline
// tracking logic: fleet-wide analytics changes must not require a commit in
// every dealer repo.
function analyticsTag() {
  const a = config.analytics || {};
  if (!a.loaderUrl) return '';
  const v = a.loaderVersion ? `?v=${encodeURIComponent(a.loaderVersion)}` : '';
  return `\n<script src="${a.loaderUrl}${v}" data-channel="${config.channelToken}" defer></script>`;
}

/* -------------------------------------------------------------------- shell */
function shell({ title, description, canonical, bodyHtml, pageCss, pageJs, ogImage, noindex }) {
  const lang = (config.seo.locale || 'en_US').split('_')[0];
  const fullTitle =
    config.seo.titleTemplate && title !== 'Home'
      ? config.seo.titleTemplate.replace('%s', title)
      : title === 'Home'
        ? config.seo.defaultTitle
        : title;
  const og = config.url + (ogImage || config.seo.ogImage);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${fullTitle}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${canonical}" />${noindex ? '\n<meta name="robots" content="noindex,nofollow" />' : ''}
<meta name="theme-color" content="${config.seo.themeColor}" />
<meta property="og:title" content="${fullTitle}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${og}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="${config.favicon}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${fontsHref()}" />
<link rel="stylesheet" href="/styles/tokens.css" />
<link rel="stylesheet" href="/styles/reset.css" />
<link rel="stylesheet" href="/styles/chrome.css" />
<style>${pageCss}</style>
<script type="application/ld+json">${businessJsonLd()}</script>${analyticsTag()}
</head>
<body>
${headerHtml}
<main>
${bodyHtml}
</main>
${footerHtml}
<script src="/scripts/chrome.js" defer></script>${pageJs ? `\n<script src="${pageJs}" defer></script>` : ''}
</body>
</html>
`;
}

function write(rel, contents) {
  const out = join(DIST, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, contents);
}

/* ----------------------------------------------------- dist + shared assets */
mkdirSync(DIST, { recursive: true });
write('styles/tokens.css', tokensCss);
write('styles/reset.css', resetCss);
write('styles/chrome.css', chromeCss);
write('scripts/chrome.js', chromeJs);

/* --------------------------------------------------------------- partials */
// Everything the Remix storefront needs to render inventory inside this site's
// chrome. reset.css and chrome.js are included because body typography and the
// mobile nav live there — without them the storefront renders unstyled chrome.
write('partials/header.html', headerHtml);
write('partials/footer.html', footerHtml);
write('partials/chrome.css', chromeCss);
write('partials/chrome.js', chromeJs);
write('partials/reset.css', resetCss);
write('partials/tokens.css', tokensCss);
write('partials/fonts.txt', fontsHref());

// Resolution manifest. Today there is one chrome combination; the shape is
// route-keyed so per-route templates can be added without a storefront change.
write(
  'partials/manifest.json',
  JSON.stringify(
    {
      contractVersion: config.contractVersion,
      generatedAt: new Date().toISOString(),
      channelToken: config.channelToken,
      storefrontPrefix: PREFIX,
      fontsHref: fontsHref(),
      chrome: {
        default: {
          header: '/partials/header.html',
          footer: '/partials/footer.html',
          styles: ['/partials/tokens.css', '/partials/reset.css', '/partials/chrome.css'],
          scripts: ['/partials/chrome.js'],
        },
      },
      routes: [{ pattern: `/${PREFIX}/*`, chrome: 'default' }],
    },
    null,
    2,
  ) + '\n',
);

/* ------------------------------------------------------------------- pages */
// status: published -> emitted, indexed, in sitemap + llms.txt
//         draft     -> emitted (so previews work) but noindex and excluded
//         archived  -> not emitted at all
const emitted = [];
for (const p of pages) {
  const status = p.status || 'published';
  if (status === 'archived') continue;

  const dir = join(SITE, 'pages', p.dir);
  const body = readText(join(dir, 'body.html'));
  if (!body) warn(`page "${p.slug}" has no body.html`);
  const css = readText(join(dir, 'style.css'));

  // Page JS: previously written by the editor and silently dropped here.
  let pageJs = null;
  if (existsSync(join(dir, 'script.js'))) {
    pageJs = `/scripts/pages/${p.dir}.js`;
    write(`scripts/pages/${p.dir}.js`, readText(join(dir, 'script.js')));
  }

  const noindex = status !== 'published' || !!(p.seo && p.seo.noindex);

  write(
    p.out,
    shell({
      title: p.title,
      description: p.description || config.seo.defaultDescription,
      canonical: config.url + p.path,
      bodyHtml: body,
      pageCss: css,
      pageJs,
      ogImage: p.seo && p.seo.ogImage,
      noindex,
    }),
  );
  emitted.push({ ...p, status, noindex });
}

const indexable = emitted.filter((p) => !p.noindex);

/* -------------------------------------------------------------------- blog */
// site/blog/posts/*.json is the shape the dashboard's siteModel.ts already parses.
// v1 read that path but the template never created it, so Posts had nowhere to write.
const BLOG = join(SITE, 'blog');
const posts = [];
if (existsSync(join(BLOG, 'posts'))) {
  const settings = existsSync(join(BLOG, 'settings.json'))
    ? readJson(join(BLOG, 'settings.json'))
    : { enabled: true, basePath: '/blog', title: 'News', description: '' };

  if (settings.enabled) {
    const base = String(settings.basePath || '/blog').replace(/\/$/, '');
    for (const f of readdirSync(join(BLOG, 'posts'))) {
      if (!f.endsWith('.json')) continue;
      const post = readJson(join(BLOG, 'posts', f));
      if ((post.status || 'published') !== 'published') continue;
      posts.push(post);
    }
    posts.sort((a, b) => (a.date < b.date ? 1 : -1));

    for (const post of posts) {
      write(
        `${base.slice(1)}/${post.slug}/index.html`,
        shell({
          title: post.title,
          description: post.description || config.seo.defaultDescription,
          canonical: `${config.url}${base}/${post.slug}`,
          bodyHtml: `<article class="post container">
  <p class="eyebrow">${new Date(post.date).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
  <h1>${post.title}</h1>
  ${post.coverImage ? `<img src="${post.coverImage}" alt="" width="1200" height="630" loading="eager" />` : ''}
  ${post.body}
</article>`,
          pageCss: '.post{padding:var(--space-7) 0}.post img{border-radius:var(--radius-card);margin:var(--space-5) 0}',
          pageJs: null,
          ogImage: post.coverImage,
          noindex: false,
        }),
      );
    }

    write(
      `${base.slice(1)}/index.html`,
      shell({
        title: settings.title,
        description: settings.description || config.seo.defaultDescription,
        canonical: config.url + base,
        bodyHtml: `<section class="container" style="padding:var(--space-7) 0">
  <h1>${settings.title}</h1>
  <p class="lede">${settings.description || ''}</p>
  <ul style="list-style:none;padding:0;margin:var(--space-6) 0 0">
${posts
  .map(
    (p) =>
      `    <li style="padding:var(--space-4) 0;border-bottom:1px solid var(--line)"><a href="${base}/${p.slug}"><strong>${p.title}</strong></a><br /><span style="color:var(--muted);font-size:var(--text-small)">${p.description || ''}</span></li>`,
  )
  .join('\n')}
  </ul>
</section>`,
        pageCss: '',
        pageJs: null,
        ogImage: null,
        noindex: false,
      }),
    );
  }
}

/* ---------------------------------------------------------------- sitemap */
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

/* ----------------------------------------------------------------- robots */
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`);

/* --------------------------------------------------------------- llms.txt */
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
  `Built ${emitted.length} page(s) (${indexable.length} indexable) + partials/manifest.json ` +
    `+ sitemap/robots/llms.txt -> dist/  [storefront prefix: /${PREFIX}]`,
);
