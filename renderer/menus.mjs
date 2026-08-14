// Menus, on the WordPress model.
//
// A dealer creates as many menus as they want, each a named tree of items. The
// theme declares *locations* — Primary, Footer, Mobile, Legal — and a menu is
// assigned to a location. One menu can sit in several locations, and a location
// can be left empty.
//
// The two halves are separate on purpose. A menu is content the dealer owns and
// renames and reorders; a location is a hole in a header or footer template.
// Collapsing them, which the first version did by hardcoding four location-shaped
// menus, makes it impossible to have a "Legal" menu that appears in two places,
// or to swap which menu the header shows without retyping every item.
//
// Items resolve their destination at render time from what they point at, so a
// page that changes slug does not leave a dead link behind.

import { esc, href, isExternal, join } from './html.mjs';

/**
 * Locations the platform's own chrome declares. A header or footer template can
 * declare more simply by using them; an unknown location renders nothing rather
 * than failing, so a template can reference a location before it is filled.
 */
export const MENU_LOCATIONS = [
  { id: 'primary', label: 'Primary', description: 'The main navigation in your header.' },
  { id: 'mobile', label: 'Mobile', description: 'Shown behind the menu button on small screens.' },
  { id: 'footer', label: 'Footer', description: 'The main footer navigation.' },
  { id: 'legal', label: 'Legal', description: 'Privacy, terms and similar, usually in the footer.' },
  { id: 'utility', label: 'Utility', description: 'A thin bar above the header — phone, hours, account.' },
];

/** Where a menu item can point. */
export const MENU_ITEM_TYPES = ['page', 'post', 'inventory', 'url', 'label'];

/** How the four v1 locations map onto the new ones, for repos written before this. */
const LEGACY_LOCATION_MAP = {
  'desktop-main': 'primary',
  'mobile-main': 'mobile',
  'desktop-footer': 'footer',
  'mobile-footer': 'mobile-footer',
};

function slugify(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

/**
 * Normalise whatever is on disk into `{ version, menus, locations }`.
 *
 * v1 was a flat map of location → { label, items }. Those repos still exist, so
 * each of their locations becomes a menu of the same name assigned to the
 * matching new location. Nothing has to be migrated by hand, and a v1 file that
 * is never edited keeps rendering the same navigation.
 */
export function parseMenus(raw) {
  if (!raw || typeof raw !== 'object') return { version: 2, menus: {}, locations: {} };

  if (raw.version >= 2 && raw.menus) {
    return {
      version: 2,
      menus: raw.menus,
      locations: raw.locations ?? {},
    };
  }

  const menus = {};
  const locations = {};
  for (const [legacyId, menu] of Object.entries(raw)) {
    if (!menu || typeof menu !== 'object' || !Array.isArray(menu.items)) continue;
    const id = slugify(legacyId, legacyId);
    menus[id] = {
      id,
      name: menu.label || legacyId,
      items: menu.items.map(upgradeItem),
    };
    const location = LEGACY_LOCATION_MAP[legacyId] ?? legacyId;
    locations[location] = id;
  }
  return { version: 2, menus, locations };
}

/** A v1 item was `{ label, href }`; the type is inferred from where it points. */
function upgradeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const url = String(item.href ?? '');
  const base = { id: slugify(item.label, 'item'), label: item.label };
  if (!url || url === '#') return { ...base, type: 'label' };
  if (isExternal(url) || url.startsWith('mailto:') || url.startsWith('tel:')) {
    return { ...base, type: 'url', url };
  }
  return { ...base, type: 'url', url };
}

/* ------------------------------------------------------------------ render */

/**
 * Resolve an item's destination.
 *
 * A `page` item points at a page's slug, not its path, so renaming the page's
 * address updates every menu that links to it. That is the whole reason the item
 * carries a type rather than just a URL.
 */
function destinationOf(item, ctx) {
  switch (item.type) {
    case 'page': {
      const page = (ctx.pages ?? []).find((p) => p.slug === item.ref);
      if (!page) {
        if (ctx.warn) ctx.warn(`Menu item "${item.label}" points at a page that no longer exists.`);
        return null;
      }
      if ((page.status ?? 'published') !== 'published' && ctx.warn) {
        ctx.warn(`Menu item "${item.label}" points at "${page.title}", which is not published.`);
      }
      return page.path;
    }
    case 'post': {
      const base = ctx.blogBasePath ?? '/blog';
      return `${base}/${item.ref}`;
    }
    case 'inventory':
      return `/${ctx.storefrontPrefix ?? 'store'}${item.ref ? `/${item.ref}` : ''}`;
    case 'url':
      return item.url || null;
    case 'label':
      // A heading inside a dropdown. Deliberately not a link.
      return null;
    default:
      return item.url || null;
  }
}

function renderItem(item, location, ctx, depth) {
  if (!item || !item.label) return '';
  const children = Array.isArray(item.children) ? item.children.filter(Boolean) : [];
  const url = destinationOf(item, ctx);
  const external = isExternal(url);

  const classes = ['bz-navitem', children.length && depth === 0 ? 'bz-navitem--has-sub' : '']
    .filter(Boolean)
    .join(' ');

  const label = url
    ? `<a href="${esc(href(url, ctx))}" data-bz-menu-item="${esc(location)}" data-bz-el="link" data-bz-intent="nav-${esc(
        location,
      )}"${external ? ' rel="noopener"' : ''}${item.newTab ? ' target="_blank"' : ''}${
        ctx.currentPath && ctx.currentPath === url ? ' aria-current="page"' : ''
      }>${esc(item.label)}</a>`
    : `<span class="bz-navlabel">${esc(item.label)}</span>`;

  // Two levels only. Deeper menus are unusable on a phone and the chrome has no
  // styling for them, so a third level is flattened into the second rather than
  // silently disappearing.
  if (!children.length) return `<li class="${classes}">${label}</li>`;
  if (depth > 0) {
    return (
      `<li class="${classes}">${label}</li>` +
      join(children.map((c) => renderItem(c, location, ctx, depth)), '')
    );
  }
  return `<li class="${classes}">${label}<ul class="bz-subnav">${join(
    children.map((c) => renderItem(c, location, ctx, depth + 1)),
    '',
  )}</ul></li>`;
}

/**
 * Render one menu as a `<ul>`.
 *
 * `ref` is either a location id or a menu id, so a template can say "whatever is
 * assigned to Primary" or name a specific menu. Both are legitimate: the header
 * wants the former, a footer column listing the Legal menu wants the latter.
 */
export function renderMenu(menus, ref, ctx = {}) {
  const parsed = parseMenus(menus);
  const menuId = parsed.locations[ref] ?? (parsed.menus[ref] ? ref : null);

  if (!menuId) {
    // Not a warning: an unassigned location is a normal state, and warning on it
    // would train people to ignore the warnings that matter.
    return '';
  }
  const menu = parsed.menus[menuId];
  if (!menu) {
    if (ctx.warn) ctx.warn(`Location "${ref}" is assigned to a menu that no longer exists.`);
    return '';
  }

  const items = (menu.items ?? []).filter((i) => i && i.label);
  if (!items.length) return '';

  return `<ul class="bz-nav" data-bz-menu="${esc(ref)}" aria-label="${esc(menu.name)}">${join(
    items.map((item) => renderItem(item, ref, ctx, 0)),
    '',
  )}</ul>`;
}

/** Replace every `<!-- menu:location -->` marker in a chrome fragment. */
export function injectMenus(html, menus, ctx = {}) {
  return String(html || '').replace(/<!--\s*menu:([a-z0-9-]+)\s*-->/gi, (_, ref) =>
    renderMenu(menus, ref, ctx),
  );
}

/** Every menu, for the editor's list. */
export function listMenus(menus) {
  return Object.values(parseMenus(menus).menus);
}

/** Which location each menu is assigned to, for the editor's badges. */
export function locationsForMenu(menus, menuId) {
  const parsed = parseMenus(menus);
  return Object.entries(parsed.locations)
    .filter(([, id]) => id === menuId)
    .map(([location]) => location);
}
