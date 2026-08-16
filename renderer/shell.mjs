// The document shell: <head>, chrome and the script/style order every page
// shares. Moved out of build.mjs so the dashboard's preview can wrap a canvas in
// the same markup the published page gets, rather than approximating it.

import { esc } from './html.mjs';

/**
 * LocalBusiness node for the dealership. Injected once per page by the shell —
 * page content must never duplicate it, or search engines see two conflicting
 * business records for one URL.
 */
export function businessJsonLd(config) {
  const biz = config.business;
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

/**
 * One versioned loader tag pointed at a platform-hosted script. Tracking logic is
 * never inlined: a fleet-wide analytics change must not require a commit in every
 * dealer repo.
 */
export function analyticsTag(config) {
  const a = config.analytics || {};
  if (!a.loaderUrl) return '';
  const v = a.loaderVersion ? `?v=${encodeURIComponent(a.loaderVersion)}` : '';
  return `\n<script src="${a.loaderUrl}${v}" data-channel="${config.channelToken}" defer></script>`;
}

/**
 * Assemble a full HTML document.
 *
 * The chrome fragments arrive already rendered (menus injected) so this function
 * stays pure string assembly — it is called from the build and from the
 * dashboard preview, and neither may depend on the other's environment.
 */
export function renderShell({
  config,
  fontsHref,
  chrome = {},
  title,
  description,
  canonical,
  bodyHtml,
  pageCss,
  pageJs,
  ogImage,
  noindex,
  tokenScopes = [],
  extraHead = '',
  storefrontPrefix = 'store',
  /**
   * Site-wide custom code, from `site/custom-code.json`. Dealer-authored, same
   * trust level as the repo itself; it runs on the dealer's published site and
   * nowhere else. Slots mirror where people are used to pasting snippets:
   * headStart (verification metas), headEnd (styles/pixels that must win),
   * bodyStart (tag-manager noscript), beforeFooter, bodyEnd (chat widgets).
   * `css` is emitted before the page's own CSS so an entity override still
   * beats the global layer; `hasJs` loads /scripts/custom.js, which the build
   * writes from the same file.
   */
  custom = {},
}) {
  const lang = (config.seo.locale || 'en_US').split('_')[0];
  const fullTitle =
    config.seo.titleTemplate && title !== 'Home'
      ? config.seo.titleTemplate.replace('%s', title)
      : title === 'Home'
        ? config.seo.defaultTitle
        : title;
  const og = config.url + (ogImage || config.seo.ogImage);
  const scopes = tokenScopes.length
    ? tokenScopes.map((s) => `\n<link rel="stylesheet" href="/styles/tokens.${s}.css" />`).join('')
    : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />${custom.headStart ? `\n${custom.headStart}` : ''}
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
<link rel="stylesheet" href="${fontsHref}" />
<link rel="stylesheet" href="/styles/tokens.css" />${scopes}
<link rel="stylesheet" href="/styles/reset.css" />
<link rel="stylesheet" href="/styles/blocks.css" />
<link rel="stylesheet" href="/styles/chrome.css" />
${custom.css ? `<style data-bz-custom>${custom.css}</style>\n` : ''}<style>${pageCss}</style>
<script type="application/ld+json">${businessJsonLd(config)}</script>${analyticsTag(config)}${extraHead}${custom.headEnd ? `\n${custom.headEnd}` : ''}
</head>
<body data-bz-prefix="${esc(storefrontPrefix)}">${custom.bodyStart ? `\n${custom.bodyStart}` : ''}
${chrome.header || ''}
<main>
${bodyHtml}
</main>${custom.beforeFooter ? `\n${custom.beforeFooter}` : ''}
${chrome.footer || ''}
<script src="/scripts/chrome.js" defer></script>
<script src="/scripts/widgets.js" defer></script>${custom.hasJs ? `\n<script src="/scripts/custom.js" defer></script>` : ''}${pageJs ? `\n<script src="${esc(pageJs)}" defer></script>` : ''}${custom.bodyEnd ? `\n${custom.bodyEnd}` : ''}
</body>
</html>
`;
}
