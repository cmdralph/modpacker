// Regenerates src/styles/themes.css from Tailwind's palette: npm run theme
import fs from 'fs';
const css = fs.readFileSync(process.argv[2] ?? "node_modules/tailwindcss/theme.css", "utf8");
const pal = {};
for (const m of css.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) (pal[m[1]] ??= {})[m[2]] = m[3].trim();
const steps = ['50','100','200','300','400','500','600','700','800','900','950'];
const out = [];
out.push(`/* Generated from Tailwind's palette. Neutral "base" scale and "accent" scale are theme-driven. */`);
out.push(`@theme inline {`);
for (const s of steps) out.push(`  --color-base-${s}: var(--base-${s});`);
for (const s of steps) out.push(`  --color-accent-${s}: var(--accent-${s});`);
out.push(`  --color-on-accent: var(--on-accent);`);
out.push(`  /* Fixed dark text for fixed brand-coloured backgrounds (Modrinth green, CurseForge orange). */`);
out.push(`  --color-ink: oklch(17% 0.02 260);`);
out.push(`}`);
out.push('');
const block = (sel, map) => { out.push(`${sel} {`); for (const [k, v] of map) out.push(`  ${k}: ${v};`); out.push('}', ''); };

// Dark (default) – slate
block(`:root,\n:root[data-theme='dark']`, steps.map(s => [`--base-${s}`, pal.slate[s]]).concat([['color-scheme', 'dark']]));
// Midnight – zinc shifted darker for OLED
const z = pal.zinc;
block(`:root[data-theme='midnight']`, [
  ['--base-50', z['50']], ['--base-100', z['100']], ['--base-200', z['200']], ['--base-300', z['300']], ['--base-400', z['400']],
  ['--base-500', z['500']], ['--base-600', z['700']], ['--base-700', z['800']], ['--base-800', z['900']], ['--base-900', 'oklch(16% 0 0)'],
  ['--base-950', 'oklch(7% 0 0)'], ['color-scheme', 'dark'],
]);
// Nether – warm stone
block(`:root[data-theme='nether']`, steps.map(s => [`--base-${s}`, pal.stone[s]]).concat([['color-scheme', 'dark']]));
// Light – inverted slate; page is light grey, cards are white.
const sl = pal.slate;
block(`:root[data-theme='light']`, [
  ['--base-50', sl['950']], ['--base-100', sl['900']], ['--base-200', sl['800']], ['--base-300', sl['700']], ['--base-400', sl['600']],
  ['--base-500', sl['500']], ['--base-600', sl['400']], ['--base-700', sl['300']], ['--base-800', sl['200']], ['--base-900', 'oklch(100% 0 0)'],
  ['--base-950', sl['100']], ['color-scheme', 'light'],
]);
// Light theme: pale status/brand text shades become their dark counterparts so they stay readable.
const flip = { '50': '950', '100': '900', '200': '800', '300': '700', '400': '600' };
const hues = ['emerald', 'orange', 'sky', 'amber', 'rose'];
block(`:root[data-theme='light']`, hues.flatMap(h => Object.entries(flip).map(([a, b]) => [`--color-${h}-${a}`, pal[h][b]])));

// Accents: raw scales per accent, then default + light mapping
const accents = ['emerald', 'sky', 'violet', 'amber', 'rose', 'lime', 'cyan', 'fuchsia'];
for (const a of accents) {
  block(a === 'emerald' ? `:root,\n:root[data-accent='emerald']` : `:root[data-accent='${a}']`, steps.map(s => [`--accent-raw-${s}`, pal[a][s]]).concat([['--on-accent', ['violet', 'rose', 'fuchsia'].includes(a) ? 'oklch(99% 0 0)' : 'oklch(17% 0.02 260)']]));
}
block(`:root`, steps.map(s => [`--accent-${s}`, `var(--accent-raw-${s})`]));
block(`:root[data-theme='light']`, Object.entries(flip).map(([a, b]) => [`--accent-${a}`, `var(--accent-raw-${b})`]));
fs.writeFileSync(process.argv[3] ?? "src/styles/themes.css", out.join("\n") + "\n");
