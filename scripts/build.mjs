// build.mjs — zero-dependency assembler for the freeform model.
//
// It does NOT run GrapesJS and does NOT re-render page bodies. The dashboard
// exports each page's final HTML/CSS (and the shared chrome) at publish and commits
// them under site/. This script only assembles: tokens -> CSS vars, wrap each page
// body in <head> + shared header/footer, inject SEO + JSON-LD, and emit sitemap,
// robots, llms.txt and the /partials/* chrome for the Remix inventory micro-site.
//
// It deliberately does NOT write vercel.json (that is committed once, per dealer,
// with the channel token baked into the /inventory rewrite).
//
// Run: node scripts/build.mjs  ->  dist/

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.cwd();
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');

const config = JSON.parse(readFileSync(join(ROOT, 'dealer.config.json'), 'utf8'));
const b = config.brand;
const biz = config.business;

// ---------------------------------------------------------------- tokens.css
const tokens = `:root {
  /* Brand — editable via dealer.config.json */
  --primary:${b.primaryColor}; --primary-dark:${b.primaryColorDark}; --accent:${b.accentColor};
  --text:${b.textColor}; --font-heading:"${b.fontHeading}",system-ui,sans-serif;
  --font-body:"${b.fontBody}",system-ui,sans-serif; --radius:${b.radius || '16px'}; --container:${b.container || '1160px'};

  /* Neutral ramp — Tailwind slate (fixed) */
  --gray-50:#f8fafc; --gray-100:#f1f5f9; --gray-200:#e2e8f0; --gray-300:#cbd5e1; --gray-400:#94a3b8;
  --gray-500:#64748b; --gray-600:#475569; --gray-700:#334155; --gray-800:#1e293b; --gray-900:#0f172a; --gray-950:#020617;
  --bg:#ffffff; --surface:var(--gray-50); --border:var(--gray-200); --muted:var(--gray-500); --dark:var(--gray-900);

  /* Spacing (fixed) */
  --space-1:.25rem; --space-2:.5rem; --space-3:.75rem; --space-4:1rem; --space-5:1.25rem; --space-6:1.5rem;
  --space-8:2rem; --space-10:2.5rem; --space-12:3rem; --space-16:4rem; --space-20:5rem; --space-24:6rem;

  /* Radius scale (fixed) */
  --radius-sm:.125rem; --radius-md:.375rem; --radius-lg:.5rem; --radius-xl:.75rem; --radius-2xl:1rem; --radius-3xl:1.5rem; --radius-full:9999px;

  /* Font size (fixed) */
  --text-xs:.75rem; --text-sm:.875rem; --text-base:1rem; --text-lg:1.125rem; --text-xl:1.25rem;
  --text-2xl:1.5rem; --text-3xl:1.875rem; --text-4xl:2.25rem; --text-5xl:3rem; --text-6xl:3.75rem;

  /* Shadow (fixed) */
  --shadow-sm:0 1px 2px rgba(15,23,42,.06); --shadow-md:0 4px 12px rgba(15,23,42,.08);
  --shadow-lg:0 12px 32px rgba(15,23,42,.10); --shadow-2xl:0 18px 50px rgba(15,23,42,.12); --shadow:var(--shadow-2xl);
}
`;

// ---------------------------------------------------------------- helpers
const header    = readFileSync(join(SITE, 'chrome', 'header.html'), 'utf8');
const footer    = readFileSync(join(SITE, 'chrome', 'footer.html'), 'utf8');
const chromeCss = readFileSync(join(SITE, 'chrome', 'chrome.css'), 'utf8');
const resetCss  = readFileSync(join(SITE, 'reset.css'), 'utf8');

function fontsHref() {
  const fams = [...new Set([b.fontHeading, b.fontBody])]
    .map(f => encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;600;700;800')
    .join('&family=');
  return `https://fonts.googleapis.com/css2?family=${fams}&display=swap`;
}

// Base AutoDealer / LocalBusiness JSON-LD injected on every page (from config.business)
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
      streetAddress: biz.streetAddress, addressLocality: biz.addressLocality,
      addressRegion: biz.addressRegion, postalCode: biz.postalCode, addressCountry: biz.addressCountry,
    },
    geo: { '@type': 'GeoCoordinates', latitude: biz.latitude, longitude: biz.longitude },
    openingHours: biz.openingHours,
    priceRange: biz.priceRange,
  });
}

function shell({ title, description, canonical, bodyHtml, pageCss }) {
  const lang = (config.seo.locale || 'en_US').split('_')[0];
  const fullTitle = config.seo.titleTemplate && title !== 'Home'
    ? config.seo.titleTemplate.replace('%s', title) : (title === 'Home' ? config.seo.defaultTitle : title);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${fullTitle}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${canonical}" />
<meta name="theme-color" content="${config.seo.themeColor}" />
<meta property="og:title" content="${fullTitle}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${config.url}${config.seo.ogImage}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="${b.favicon}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${fontsHref()}" />
<link rel="stylesheet" href="/styles/tokens.css" />
<link rel="stylesheet" href="/styles/reset.css" />
<link rel="stylesheet" href="/styles/chrome.css" />
<style>${pageCss}</style>
<script type="application/ld+json">${businessJsonLd()}</script>
</head>
<body>
${header}
<main>
${bodyHtml}
</main>
${footer}
</body>
</html>
`;
}

function write(rel, contents) {
  const out = join(DIST, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, contents);
}

// ---------------------------------------------------------------- reset dist + shared styles
mkdirSync(DIST, { recursive: true });
write('styles/tokens.css', tokens);
write('styles/reset.css', resetCss);
write('styles/chrome.css', chromeCss);

// chrome + tokens for the Remix inventory micro-site to wrap inventory in
write('partials/header.html', header);
write('partials/footer.html', footer);
write('partials/chrome.css', chromeCss);
write('partials/tokens.css', tokens);

// ---------------------------------------------------------------- pages (freeform bodies)
const pages = JSON.parse(readFileSync(join(SITE, 'pages.json'), 'utf8'));
for (const p of pages) {
  const body = readFileSync(join(SITE, 'pages', p.dir, 'body.html'), 'utf8');
  const css  = existsSync(join(SITE, 'pages', p.dir, 'style.css'))
    ? readFileSync(join(SITE, 'pages', p.dir, 'style.css'), 'utf8') : '';
  write(p.out, shell({
    title: p.title,
    description: p.description || config.seo.defaultDescription,
    canonical: config.url + p.path,
    bodyHtml: body,
    pageCss: css,
  }));
}

// ---------------------------------------------------------------- sitemap.xml
const sitemapUrls = pages.map(p => config.url + p.path).concat([`${config.url}/inventory`]);
write('sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemapUrls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + `\n</urlset>\n`);

// ---------------------------------------------------------------- robots.txt (with sitemap)
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`);

// ---------------------------------------------------------------- llms.txt (AIO)
const llms =
`# ${config.name}
> ${config.seo.defaultDescription}

${config.name} is a ${biz.type} in ${biz.addressLocality}, ${biz.addressRegion}.
Phone: ${biz.phone}. Address: ${biz.streetAddress}, ${biz.addressLocality}, ${biz.addressRegion} ${biz.postalCode}.
Hours: ${biz.openingHours.join('; ')}.

## Pages
${pages.map(p => `- [${p.title}](${config.url}${p.path}): ${p.description || ''}`).join('\n')}

## Inventory
- Browse live inventory, pricing and availability: ${config.url}/inventory
`;
write('llms.txt', llms);

// ---------------------------------------------------------------- public/*
if (existsSync(join(ROOT, 'public'))) cpSync(join(ROOT, 'public'), DIST, { recursive: true });

console.log(`Built ${pages.length} page(s) + chrome partials + sitemap/robots/llms.txt -> dist/`);
