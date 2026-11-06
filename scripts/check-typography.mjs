#!/usr/bin/env node
/**
 * Type-scale & text-contrast checker — enforces SKILL.md › "Typography" in .claude/skills/ui-ux-standards.
 *
 *   node scripts/check-typography.mjs            # whole src/, errors only
 *   node scripts/check-typography.mjs --warn     # also print review warnings
 *   node scripts/check-typography.mjs src/routes/profile.tsx src/components
 *
 * Escape hatch: put `a11y-ok: <reason>` in a comment on the same line or the line above
 * (e.g. brand text on the navy sidebar, where vivid brand passes 5.8:1).
 * Exit code 1 when any error is found.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const SHOW_WARN = args.includes("--warn");
const targets = args.filter((a) => !a.startsWith("--"));
const roots = targets.length ? targets : ["src"];
const SKIP = [/routeTree\.gen\.ts$/, /\.d\.ts$/];

function walk(p, out) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) walk(join(p, f), out);
  } else if ([".tsx", ".ts"].includes(extname(p)) && !SKIP.some((r) => r.test(p))) out.push(p);
  return out;
}
const files = roots.flatMap((r) => walk(join(ROOT, r), []));

/* ---------------- contract ---------------- */
const HEADING = {
  h1: ["text-2xl", "sm:text-3xl", "lg:text-4xl", "leading-[1.2]"],
  h2: ["text-xl", "lg:text-2xl", "leading-[1.2]"],
  h3: ["text-lg", "lg:text-xl", "leading-[1.2]"],
  h4: ["text-base", "leading-[1.2]"],
  h5: ["text-base", "leading-[1.2]"],
  h6: ["text-base", "leading-[1.2]"],
};
// Components that render a heading element.
const HEADING_ALIAS = { DialogTitle: "h2", SheetTitle: "h2", AlertDialogTitle: "h2", DrawerTitle: "h2" };
const DISPLAY = ["text-4xl", "sm:text-6xl", "lg:text-7xl", "leading-[1.2]"];
const SIZE_TOKEN = /(?<![\w\-\[])((?:(?:[\w-]+|\[[^\]\s]+\]):)*)text-(xs|sm|base|lg|xl|[2-9]xl|\[[\d.]+(?:px|rem|em)\])(?![\w\-])/g;
const NON_TEXT_INPUT = /type\s*=\s*["'{`]*(checkbox|radio|range|file|hidden|color|submit|button|image)\b/;
const RAW_PALETTE =
  /(?<![\w-])(?:[\w-]+:)*text-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?![\w-])/;
const OPACITY_TEXT =
  /(?<![\w-])((?:[\w-]+:)*)text-(foreground|card-foreground|muted-foreground|brand-strong|success|info|destructive|warning-foreground|accent-foreground|primary|white|navy-foreground|sidebar-foreground)\/(\d{1,3})(?![\w-])/g;

/* ---------------- real contrast for faded text (tokens read from styles.css :root) ---------------- */
const css = readFileSync(join(ROOT, "src/styles.css"), "utf8");
const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const TOKENS = {};
for (const m of rootBlock.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) TOKENS[m[1]] = [+m[2], +m[3], +m[4]];
TOKENS.white = [1, 0, 0];
function oklchToRgb([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
}
// Linear-light values compared directly (WCAG relative luminance on linear sRGB components).
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const ratio = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05);
// Browsers alpha-blend in gamma-encoded sRGB, so encode → blend → decode.
const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const dec = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const mix = (fg, bg, a) => fg.map((v, i) => dec(enc(v) * a + enc(bg[i]) * (1 - a)));
const ON_DARK = new Set(["white", "navy-foreground", "sidebar-foreground", "primary-foreground", "brand-foreground"]);
/** Worst-case contrast of `token` at `opacity` over the surfaces it is used on. */
function fadedContrast(token, opacity) {
  const fg = oklchToRgb(TOKENS[token] ?? TOKENS.foreground);
  const surfaces = ON_DARK.has(token) ? ["navy"] : ["card", "background", "muted"];
  return Math.min(
    ...surfaces.map((s) => {
      const bg = oklchToRgb(TOKENS[s]);
      return ratio(mix(fg, bg, opacity), bg);
    }),
  );
}

const errors = [];
const warnings = [];
const rel = (f) => relative(ROOT, f).replace(/\\/g, "/");

/** Find each JSX opening tag: returns { name, text, index }. Handles braces, strings and `=>`. */
function openingTags(src) {
  const out = [];
  const re = /<([A-Za-z][\w.]*)(?=[\s>/])/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    // Skip generics like useState<string>( and comparisons a<b: require previous non-space char to not be identifier char.
    const prev = src.slice(Math.max(0, start - 1), start);
    if (/[\w)\]]/.test(prev)) continue;
    let i = re.lastIndex;
    let depth = 0;
    let quote = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        else if (quote === "`" && c === "$" && src[i + 1] === "{") {
          /* template expression — treat as brace */
        }
        continue;
      }
      // Skip JS comments inside attribute expressions so apostrophes in them don't open a "string".
      if (depth > 0 && c === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end < 0 ? src.length : end + 1;
        continue;
      }
      if (depth > 0 && c === "/" && src[i + 1] === "/") {
        const end = src.indexOf("\n", i);
        i = end < 0 ? src.length : end;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      else if (c === "<" && depth === 0 && i > re.lastIndex) {
        i = -1; // not a real tag (e.g. `a < b`)
        break;
      }
    }
    if (i < 0) continue;
    out.push({ name: m[1], text: src.slice(start, i + 1), index: start });
  }
  return out;
}

function lineOf(src, idx) {
  let n = 1;
  for (let i = 0; i < idx; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

/** Collect `const NAME = "...classes..."` — used to resolve className={NAME}. Exported ones are shared. */
function collectConstants(src, local, exported) {
  const re = /(export\s+)?(?:const|let)\s+([A-Za-z_]\w*)\s*(?::\s*[^=]+)?=\s*((?:["'`][^"'`]*["'`]\s*\+?\s*)+)/g;
  let m;
  while ((m = re.exec(src))) {
    local.set(m[2], (local.get(m[2]) ?? "") + " " + m[3]);
    if (m[1]) exported.set(m[2], (exported.get(m[2]) ?? "") + " " + m[3]);
  }
}

const exportedConstants = new Map();
const localConstants = new Map();
const sources = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  sources.set(f, src);
  const local = new Map();
  collectConstants(src, local, exportedConstants);
  localConstants.set(f, local);
}
// Resolve shared constants from files outside the scanned set too (e.g. when checking one route).
for (const f of walk(join(ROOT, "src"), [])) {
  if (!sources.has(f)) collectConstants(readFileSync(f, "utf8"), new Map(), exportedConstants);
}
let constants = new Map();

function escaped(lines, ln) {
  return /a11y-ok/.test(lines[ln - 1] ?? "") || /a11y-ok/.test(lines[ln - 2] ?? "");
}

function report(list, f, src, lines, idx, rule, msg) {
  const ln = lineOf(src, idx);
  if (escaped(lines, ln)) return;
  list.push(`${rel(f)}:${ln}  [${rule}] ${msg}`);
}

/** All class-size tokens in a text (ignores `file:` button variant which styles the native file button). */
function sizeTokens(text) {
  return [...text.matchAll(SIZE_TOKEN)].map((m) => ({ variant: m[1], size: m[2], full: m[0] }));
}

/** Text with referenced constants inlined (className={inputCls} / `${inputCls}` / cn(inputCls, …)). */
function resolved(text) {
  let extra = "";
  for (const [name, val] of constants) {
    if (new RegExp(`(?<![\\w.])${name}(?![\\w])`).test(text)) extra += " " + val;
  }
  return text + extra;
}

for (const f of files) {
  const src = sources.get(f);
  const lines = src.split(/\r?\n/);
  constants = new Map([...exportedConstants, ...localConstants.get(f)]);

  /* ---- whole-file token rules ---- */
  lines.forEach((line, i) => {
    const ln = i + 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments
    const at = (rule, msg) => !escaped(lines, ln) && errors.push(`${rel(f)}:${ln}  [${rule}] ${msg}`);

    for (const t of sizeTokens(line)) {
      if (t.size.startsWith("[")) at("E1 arbitrary-size", `"${t.full}" is off the type scale — use text-xs/sm/base/lg/xl/2xl/3xl/4xl`);
      else if (/^(5xl|8xl|9xl)$/.test(t.size)) at("E2 off-scale", `"${t.full}" is not in the type scale`);
      const bp = /(?:^|:)(sm|md|lg|xl|2xl):$/.exec(t.variant);
      if (bp && /^(xs|sm)$/.test(t.size)) at("E3 down-size", `"${t.full}" shrinks text at a larger breakpoint (mobile auto-zoom / scale inversion)`);
    }
    const fs = /fontSize\s*[:=]\s*["'{]?\s*(\d+(?:\.\d+)?)/.exec(line);
    if (fs && Number(fs[1]) < 12) at("E4 tiny-inline", `inline fontSize ${fs[1]} < 12px`);
    // Decorative icons (<SomeIcon className="size-4 text-brand" aria-hidden />) are non-text: 3:1 applies, vivid brand passes.
    const isIconLine =
      /<[A-Z]\w*\b[^>]*\bsize-[\w.[\]]+[^>]*aria-hidden/.test(line) || /<svg\b[^>]*\bsize-[\w.[\]]+/.test(line);
    if (!isIconLine && /(?<![\w-])(?:[\w-]+:)*text-brand(?![\w-])/.test(line))
      at("E8 brand-text", `"text-brand" is 3.1:1 — use text-brand-strong (vivid brand is for non-text marks only)`);
    if (/(?<![\w-])(?:[\w-]+:)*text-warning(?![\w-])/.test(line))
      at("E10 warning-text", `"text-warning" is 2.8:1 — use text-warning-foreground`);
    const rp = RAW_PALETTE.exec(line);
    if (rp) at("E11 raw-palette", `"${rp[0]}" — raw palette text colour, contrast unverified; use a semantic token`);
    for (const m of line.matchAll(OPACITY_TEXT)) {
      const variant = m[1];
      const op = Number(m[3]);
      if (/(^|:)(disabled|group-disabled|peer-disabled|aria-disabled|data-\[disabled\]):/.test(variant)) continue;
      const token = m[2] === "primary" ? "primary" : m[2];
      const cr = fadedContrast(token, op / 100);
      if (cr < 4.5) at("E12 faded-text", `"${m[0]}" is ${cr.toFixed(2)}:1 (< 4.5) — use the full token or text-muted-foreground`);
    }
    if (/(?<![\w-])font-(serif|sans)(?![\w-])|fontFamily/.test(line))
      at("E13 typeface", `extra typeface — only Inter (default) and font-mono are allowed`);
    if (/(?<![\w-])(?:[\w-]+:)*leading-(none|tight|snug|3|4|5)(?![\w-])/.test(line))
      warnings.push(`${rel(f)}:${ln}  [W2 leading] tight leading — fine on headings/badges, not on body text`);
  });

  /* ---- tag rules (JSX only; .ts files may hold raw HTML strings styled with plain CSS) ---- */
  for (const tag of extname(f) === ".tsx" ? openingTags(src) : []) {
    const name = tag.name;
    const text = tag.text;
    const full = resolved(text);
    const level = /^h[1-6]$/.test(name) ? name : HEADING_ALIAS[name];

    // E9 brand fill behind white text
    if (
      // before:/after: fills are pseudo-element marks (indicator bars), never behind text.
      [...full.matchAll(/(?<![\w-])((?:[\w-]+:)*)bg-brand(?![\w-]|\/)/g)].some((m) => !/(^|:)(before|after):$/.test(m[1])) &&
      /(?<![\w-])text-(white|brand-foreground|primary-foreground|navy-foreground)(?![\w-])/.test(full)
    )
      report(errors, f, src, src.split(/\r?\n/), tag.index, "E9 brand-fill", `white text on vivid bg-brand is 3.0:1 — use bg-brand-strong`);

    if (level) {
      if (/\bsr-only\b/.test(text) && !/not-sr-only/.test(text)) continue;
      // Heading components without className use their ui/* defaults, which are checked in their own files.
      if (HEADING_ALIAS[name] && !/className=/.test(text)) continue;
      const isDisplay = DISPLAY.every((c) => text.includes(c));
      const need = isDisplay ? DISPLAY : HEADING[level];
      const missing = need.filter((c) => !full.includes(c));
      const extra = sizeTokens(full)
        .map((t) => t.full)
        .filter((t) => !need.includes(t));
      if (missing.length || extra.length)
        report(
          errors,
          f,
          src,
          lines,
          tag.index,
          "E5 heading",
          `<${name}> must use "${HEADING[level].join(" ")}"` +
            (missing.length ? ` — missing ${missing.join(" ")}` : "") +
            (extra.length ? ` — remove ${extra.join(" ")}` : ""),
        );
      continue;
    }

    if (/^(input|select|textarea|Input|Textarea|CommandInput|SelectTrigger)$/.test(name)) {
      if (name === "input" && NON_TEXT_INPUT.test(text)) continue;
      const isSmall = (t) => /^(xs|sm)$/.test(t.size) && !/(^|:)file:/.test(t.variant);
      const own = sizeTokens(text).filter(isSmall);
      const small = sizeTokens(full).filter(isSmall);
      if (own.length)
        report(errors, f, src, lines, tag.index, "E6 input-size", `<${name}> text must be 16px (text-base) — found ${own.map((t) => t.full).join(" ")}`);
      else if (small.length) {
        const via = [...constants.keys()].filter((k) => new RegExp(`(?<![\\w.])${k}(?![\\w])`).test(text) && sizeTokens(constants.get(k)).some(isSmall));
        report(errors, f, src, lines, tag.index, "E6 input-size", `<${name}> is 14px via shared constant ${via.join(", ")} (from shared constant — fix the constant, not this tag)`);
      }
      continue;
    }

    if (/^(button|summary|Btn|LinkBtn|Button|DropdownMenuItem|CommandItem|TabsTrigger)$/.test(name) || /role\s*=\s*["'](tab|button|menuitem|option|switch)["']/.test(text)) {
      if (/\bsr-only\b/.test(text)) continue;
      // `[&>span]:text-xs` styles a child caption, not the button label.
      const tiny = sizeTokens(text).filter((t) => t.size === "xs" && !t.variant.startsWith("["));
      if (tiny.length) report(errors, f, src, lines, tag.index, "E7 button-size", `<${name}> buttons are ≥ 14px — use text-sm (found ${tiny[0].full})`);
    }

    // Product decision: text spans its container, never a fixed reading measure, so pages don't end in half-empty rows.
    if (/^(p|span|div)$/.test(name) && /(?:^|[s"'*:])max-w-(?:prose|2xl|3xl)/.test(text) && !/mx-auto/.test(text))
      report(errors, f, src, lines, tag.index, "E9 text-width", "text must fill its container — remove max-w-prose / max-w-2xl / max-w-3xl (centred blocks with mx-auto are exempt)");
  }
}

for (const e of errors) console.log(e);
if (SHOW_WARN) for (const w of warnings) console.log(w);
console.log(`\ncheck-typography: ${errors.length} error(s), ${warnings.length} warning(s) in ${files.length} files`);
process.exit(errors.length ? 1 : 0);
