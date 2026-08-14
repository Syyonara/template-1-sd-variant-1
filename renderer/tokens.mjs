// The design system compiler. `site/tokens.json` is the single editable source;
// everything below is derived from it. This module is the ONLY place the
// compilation rules live — the dashboard canvas imports the same function, so
// preview and production cannot drift.

const px = (n) => `${n}px`;
const rem = (n) => `${(Number(n) / 16).toFixed(4).replace(/\.?0+$/, '')}rem`;

/** Token keys a scoped override is allowed to set, grouped as they appear in JSON. */
export const TOKEN_GROUPS = {
  colors: ['accent', 'accentDark', 'ink', 'inkDark', 'muted', 'line', 'card', 'paper'],
  status: ['ok', 'info', 'warn', 'bad'],
  type: ['h1', 'h2', 'h3', 'body', 'small', 'eyebrow'],
  spacing: ['1', '2', '3', '4', '5', '6', '7'],
  radius: ['nav', 'input', 'card', 'modal', 'chip'],
  fonts: ['heading', 'body'],
  layout: ['container'],
};

/** The CSS custom property each token key maps to, and how its value is formatted. */
const DECLARATIONS = {
  colors: {
    accent: ['--accent', String],
    accentDark: ['--accent-dark', String],
    ink: ['--ink', String],
    inkDark: ['--ink-dark', String],
    muted: ['--muted', String],
    line: ['--line', String],
    card: ['--card', String],
    paper: ['--paper', String],
  },
  status: {
    ok: ['--ok', String],
    info: ['--info', String],
    warn: ['--warn', String],
    bad: ['--bad', String],
  },
  type: {
    h1: ['--text-h1', rem],
    h2: ['--text-h2', rem],
    h3: ['--text-h3', rem],
    body: ['--text-body', rem],
    small: ['--text-small', rem],
    eyebrow: ['--text-eyebrow', rem],
  },
  spacing: {
    1: ['--space-1', px],
    2: ['--space-2', px],
    3: ['--space-3', px],
    4: ['--space-4', px],
    5: ['--space-5', px],
    6: ['--space-6', px],
    7: ['--space-7', px],
  },
  radius: {
    nav: ['--radius-nav', px],
    input: ['--radius-input', px],
    card: ['--radius-card', px],
    modal: ['--radius-modal', px],
    chip: ['--radius-chip', px],
  },
  layout: { container: ['--container', String] },
};

/**
 * Compile `site/tokens.json` into the `:root` block.
 *
 * The fixed extension layer (neutral ramp, wide type/space scales, shadows) and
 * the v1 back-compat aliases are deliberate: live page CSS is written against
 * `--primary`, `--bg`, `--surface`, `--border` and `--radius-full`, and removing
 * them silently restyles every published site.
 */
export function compileTokens(t) {
  const c = t.colors,
    s = t.status,
    ty = t.type,
    sp = t.spacing,
    r = t.radius,
    f = t.fonts;
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

/**
 * Compile a scoped override — a brand page's own design system.
 *
 * A brand page restyles within the same cascade (`[data-bz-tokens="kenworth"]`)
 * rather than loading a second stylesheet, so the base tokens stay in force for
 * anything the override does not mention. An override may only set keys that
 * already exist in the base: introducing a key would defeat the fixed key set
 * that lets the editor, the AI and the build agree on the vocabulary.
 */
export function compileTokenScope(scope, override, base) {
  const lines = [];
  const unknown = [];
  for (const [group, values] of Object.entries(override || {})) {
    const decls = DECLARATIONS[group];
    if (group === 'fonts') {
      if (values.heading) lines.push(`  --font-heading:"${values.heading}",system-ui,sans-serif;`);
      if (values.body) lines.push(`  --font-body:"${values.body}",system-ui,sans-serif;`);
      continue;
    }
    if (!decls) {
      if (group !== '$schema' && group !== 'version') unknown.push(group);
      continue;
    }
    for (const [key, value] of Object.entries(values || {})) {
      const decl = decls[key];
      if (!decl) {
        unknown.push(`${group}.${key}`);
        continue;
      }
      if (base && base[group] && base[group][key] === undefined) {
        unknown.push(`${group}.${key}`);
        continue;
      }
      lines.push(`  ${decl[0]}:${decl[1](value)};`);
    }
  }
  const css = lines.length ? `[data-bz-tokens="${scope}"] {\n${lines.join('\n')}\n}\n` : '';
  return { css, unknown };
}

/** Google Fonts href for the token set's heading + body families. */
export function fontsHref(tokens) {
  const fams = [...new Set([tokens.fonts.heading, tokens.fonts.body])]
    .map((f) => encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;600;700;800')
    .join('&family=');
  return `https://fonts.googleapis.com/css2?family=${fams}&display=swap`;
}
