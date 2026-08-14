// Menus. Navigation lives in `site/menus.json` and is injected into the chrome at
// build time through `<!-- menu:<location> -->` markers, so nav is never
// hand-written into header.html: one edit updates every page and the storefront
// partials the Remix app wraps inventory in.
//
// Dynamic items (locations, brands) are expanded by the dashboard when it
// commits, not here — the build has no privileged credentials.

import { esc, href, isExternal, join } from './html.mjs';

export const MENU_LOCATIONS = ['desktop-main', 'mobile-main', 'desktop-footer', 'mobile-footer'];

function renderItem(item, location, ctx, depth) {
  const external = isExternal(item.href);
  const children = Array.isArray(item.children) ? item.children : [];
  const link = `<a${[
    ` href="${esc(href(item.href, ctx))}"`,
    ` data-bz-menu-item="${esc(location)}"`,
    ' data-bz-el="link"',
    ` data-bz-intent="nav-${esc(location)}"`,
    external ? ' rel="noopener"' : '',
    item.current ? ' aria-current="page"' : '',
  ].join('')}>${esc(item.label)}</a>`;

  // One level of nesting only. Deeper menus are a maintenance trap on mobile and
  // the chrome has no styling for them.
  if (!children.length || depth > 0) return `<li class="bz-navitem">${link}</li>`;
  return `<li class="bz-navitem bz-navitem--has-sub">${link}<ul class="bz-subnav">${join(
    children.map((c) => renderItem(c, location, ctx, depth + 1)),
    '',
  )}</ul></li>`;
}

/** Render one menu location as a `<ul>`. Unknown location renders nothing + warns. */
export function renderMenu(menus, location, ctx = {}) {
  const menu = menus && menus[location];
  if (!menu) {
    if (ctx.warn) ctx.warn(`menus.json has no location "${location}" — referenced by the chrome.`);
    return '';
  }
  const items = (menu.items || []).filter((i) => i && i.label);
  if (!items.length) return '';
  return `<ul class="bz-nav" data-bz-menu="${esc(location)}">${join(
    items.map((i) => renderItem(i, location, ctx, 0)),
    '',
  )}</ul>`;
}

/** Replace every `<!-- menu:location -->` marker in a chrome fragment. */
export function injectMenus(html, menus, ctx = {}) {
  return String(html || '').replace(/<!--\s*menu:([a-z0-9-]+)\s*-->/gi, (_, loc) =>
    renderMenu(menus, loc, ctx),
  );
}
