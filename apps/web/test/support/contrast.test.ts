import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, resolveTokens } from './contrast';

describe('parseColor', () => {
  it('parses hex (short and long) to sRGB 0..1', () => {
    expect(parseColor('#fff')).toEqual([1, 1, 1]);
    expect(parseColor('#000000')).toEqual([0, 0, 0]);
  });

  it('converts oklch to sRGB', () => {
    const [r, g, b] = parseColor('oklch(100% 0 0)');
    expect([r, g, b].map((c) => Math.round(c * 255))).toEqual([255, 255, 255]);
    // Tailwind indigo-600 = oklch(51.1% 0.262 276.966) ≈ #4f39f6 (sRGB-clipped)
    const indigo = parseColor('oklch(51.1% 0.262 276.966)').map((c) => Math.round(c * 255));
    expect(indigo[0]).toBeCloseTo(0x4f, -1);
    expect(indigo[2]).toBeGreaterThan(0xe0);
  });

  it('rejects an unsupported colour', () => {
    expect(() => parseColor('rebeccapurple')).toThrow(/Unsupported colour/);
  });
});

describe('contrastRatio', () => {
  it('matches WCAG known values', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777', '#fff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#fff', '#fff')).toBe(1);
  });
});

describe('resolveTokens', () => {
  it('resolves var() chains from a palette and reads a selector block', () => {
    const css =
      ':root { --bg: var(--color-white); --fg: var(--color-ink); }\n.dark { --bg: #000; }';
    const palette = {
      '--color-white': '#fff',
      '--color-ink': 'var(--color-black)',
      '--color-black': '#000',
    };
    expect(resolveTokens(css, ':root', palette)).toEqual({ '--bg': '#fff', '--fg': '#000' });
    expect(resolveTokens(css, '.dark', palette)).toEqual({ '--bg': '#000' });
  });

  it('throws on an unknown variable or a missing block', () => {
    expect(() => resolveTokens(':root { --a: var(--nope); }', ':root', {})).toThrow(/--nope/);
    expect(() => resolveTokens(':root {}', '.dark', {})).toThrow(/\.dark/);
  });
});
