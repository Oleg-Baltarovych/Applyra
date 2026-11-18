// WCAG 2.x contrast for design tokens (10 §8): parse hex / oklch, resolve var() chains, compute the ratio.
// oklch → OKLab → linear sRGB → gamma sRGB, clipped to [0, 1] (what a browser shows for an out-of-gamut colour).

export type Rgb = [r: number, g: number, b: number];

const clip = (c: number) => Math.min(1, Math.max(0, c));
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((ch) => clip(gamma(ch))) as Rgb; // map() of 3 channels yields 3 numbers; TS widens the tuple to number[]
}

/** sRGB channels 0..1 of `#rgb`, `#rrggbb` or `oklch(L% C H)`. */
export function parseColor(value: string): Rgb {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((ch) => ch + ch).join('') : hex;
    // map() over a 3-element literal always yields 3 numbers; TS widens the tuple to number[].
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
  }
  const ok = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(v);
  if (ok) return oklchToRgb(Number(ok[1]) / 100, Number(ok[2]), Number(ok[3]));
  throw new Error(`Unsupported colour: ${value}`);
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG contrast ratio (1..21) of two colours, order-independent. */
export function contrastRatio(a: string, b: string): number {
  // sort() of a 2-element array keeps both elements; TS widens the tuple to number[].
  const [hi, lo] = [luminance(parseColor(a)), luminance(parseColor(b))].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** `--name: value;` declarations of a CSS block body. */
export function declarations(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], (m[2] ?? '').trim()]),
  );
}

/**
 * Custom properties of the first `selector { … }` block in `css`, every `var(--x)` resolved against the block
 * itself and `palette` (e.g. Tailwind's theme.css). Throws on an unknown variable.
 */
export function resolveTokens(
  css: string,
  selector: string,
  palette: Record<string, string>,
): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (body === undefined) throw new Error(`No ${selector} block`);
  const own = declarations(body);
  const lookup = { ...palette, ...own };
  const resolve = (value: string, depth = 0): string => {
    const ref = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
    if (!ref) return value;
    const next = lookup[ref];
    if (next === undefined || depth > 10) throw new Error(`Unknown variable ${ref}`);
    return resolve(next, depth + 1);
  };
  return Object.fromEntries(Object.entries(own).map(([k, v]) => [k, resolve(v)]));
}
