// Template resolution — the Theme Builder semantic, without drag-and-drop.
//
// Without this there is no way to attach a header or a footer to a page, so a
// dealer either gets one chrome for everything or hand-edits markup. Resolution
// is deliberately explainable: `resolveTemplates` returns the winning rule
// alongside the id, so the dashboard can show "resolving now" and a support
// engineer can answer "why is this header here" without reading four files.

/**
 * The parts of the page that are not the page.
 *
 * Two, not four. The first version had `utilityNav` and `siteFooter` as separate
 * slots, which was a mistake: a utility bar is a row inside a header template and
 * a secondary footer is a row inside a footer template. Making them slots meant
 * four things to assign, four places to look, and no way to put a utility bar
 * *below* the nav — the layout was baked into the slot list rather than authored.
 */
export const SLOTS = ['header', 'footer'];

/** Higher wins. A tie between two rules of equal specificity is a save-time error. */
const SPECIFICITY = {
    page: 500,
    exact: 400,
    route: 300,
    group: 200,
    pdpType: 200,
    plp: 200,
    brand: 200,
    blog: 200,
    all: 100,
};

function matchRoute(pattern, route) {
  if (!pattern) return false;
  if (pattern === route) return true;
  if (!pattern.includes('*')) return false;
  const rx = new RegExp(
    '^' +
      pattern
        .split('*')
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$',
  );
  return rx.test(route);
}

/**
 * Does one condition apply to this route?
 *
 * `ctx` describes what the route is, not where it came from: `{ route, group,
 * kind }` where kind is 'page' | 'plp' | 'pdp' | 'brand' and pdpType is
 * 'listings' | 'parts' | 'showrooms'.
 */
function conditionMatches(condition, ctx) {
  switch (condition.type) {
    case 'all':
      return true;
    case 'exact':
      return condition.path === ctx.route;
    case 'route':
      return matchRoute(condition.pattern, ctx.route);
    case 'group':
      return !!ctx.group && ctx.group === condition.group;
    case 'plp':
      return ctx.kind === 'plp';
    case 'blog':
      return ctx.kind === 'post' || ctx.kind === 'blog';
    case 'brand':
      return ctx.kind === 'brand';
    case 'pdpType':
      return ctx.kind === 'pdp' && ctx.pdpType === condition.pdpType;
    default:
      return false;
  }
}

function describe(condition) {
  switch (condition.type) {
    case 'all':
      return 'the whole site';
    case 'exact':
      return `the page at ${condition.path}`;
    case 'route':
      return `pages matching ${condition.pattern}`;
    case 'blog':
      return 'blog posts';
    case 'group':
      return `page group "${condition.group}"`;
    case 'plp':
      return 'inventory listing pages';
    case 'brand':
      return 'brand pages';
    case 'pdpType':
      return `${condition.pdpType} product pages`;
    default:
      return condition.type;
  }
}

/**
 * Resolve every slot for one route.
 *
 * Order, first match wins:
 *   1. explicit page-level override (pages.json -> templates{})
 *   2. most specific matching display condition (assignments.json -> rules)
 *   3. the channel default for that slot (assignments.json -> defaults)
 *   4. the renderer default, which ships with the package and cannot be missing
 *
 * Returns `{ slot: { templateId, rule, ruleLabel, conflict } }`. A conflict is
 * two equally specific rules naming different templates: reported rather than
 * silently picked, because a silent pick is unexplainable a month later.
 */
export function resolveTemplates(routeCtx, pageEntry, assignments = {}) {
  const rules = Array.isArray(assignments.rules) ? assignments.rules : [];
  const defaults = assignments.defaults || {};
  const out = {};

  for (const slot of SLOTS) {
    const override = pageEntry && pageEntry.templates ? pageEntry.templates[slot] : null;
    if (override) {
      out[slot] = { templateId: override, rule: 'page', ruleLabel: 'page-level override', conflict: null };
      continue;
    }

    const matches = rules
      .filter((r) => r.slot === slot && r.condition && conditionMatches(r.condition, routeCtx))
      .map((r) => ({ ...r, weight: SPECIFICITY[r.condition.type] ?? 0 }))
      .sort((a, b) => b.weight - a.weight);

    if (matches.length) {
      const top = matches[0];
      const tied = matches.filter(
        (m) => m.weight === top.weight && m.templateId !== top.templateId,
      );
      out[slot] = {
        templateId: top.templateId,
        rule: 'condition',
        ruleLabel: describe(top.condition),
        conflict: tied.length
          ? `${tied.length + 1} equally specific rules (${describe(top.condition)}) name different templates`
          : null,
      };
      continue;
    }

    if (defaults[slot]) {
      out[slot] = {
        templateId: defaults[slot],
        rule: 'channelDefault',
        ruleLabel: 'channel default',
        conflict: null,
      };
      continue;
    }

    // Nothing assigned. The site still needs a header and a footer, so the
    // starter template the dealer's site was created with is used, and the label
    // says so rather than saying "shipped default", which meant nothing to
    // anyone who had not read this file.
    out[slot] = {
      templateId: `${slot}--default`,
      rule: 'starter',
      ruleLabel: `your starter ${slot}`,
      conflict: null,
    };
  }
  return out;
}

/**
 * Every distinct chrome combination a set of routes resolves to, keyed so the
 * build can emit one pre-rendered fragment per combination and the storefront
 * can pick one by route. `default` is always present: a storefront must never
 * render chromeless because a manifest entry is missing.
 */
export function chromeCombinations(routes, pages, assignments) {
  const combos = new Map();
  const table = [];

  const keyOf = (resolved) =>
    SLOTS.map((s) => resolved[s].templateId)
      .join('|')
      .replace(/[^a-z0-9|-]/gi, '-')
      .replace(/\|/g, '__');

  // The default combination is resolved first and every route that lands on the
  // same set of templates is folded into it, so the common case — one chrome for
  // the whole site — emits one fragment rather than one per route.
  const defaultRoute = routes.find((r) => r.isDefault) || { route: '/', kind: 'page' };
  const defaultResolved = resolveTemplates(
    defaultRoute,
    (pages || []).find((p) => p.path === defaultRoute.route) || null,
    assignments,
  );
  const defaultKey = keyOf(defaultResolved);
  combos.set('default', defaultResolved);

  for (const route of routes) {
    const pageEntry = (pages || []).find((p) => p.path === route.route) || null;
    const resolved = resolveTemplates(route, pageEntry, assignments);
    const raw = keyOf(resolved);
    const key = raw === defaultKey ? 'default' : raw;
    if (!combos.has(key)) combos.set(key, resolved);
    table.push({ pattern: route.pattern || route.route, chrome: key });
  }
  return { combos, table };
}

/** Filename for a template file, mirroring `site/templates/<slot>--<name>.json`. */
export function templatePath(templateId) {
  return `site/templates/${templateId}.json`;
}
