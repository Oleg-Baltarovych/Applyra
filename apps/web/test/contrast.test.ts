// Contrast gate for the design tokens (10 §8, WCAG 2.2 AA): text ≥ 4.5:1, focus ring ≥ 3:1, both themes.
// Reads src/styles/globals.css and resolves Tailwind palette references from tailwindcss/theme.css.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, declarations, resolveTokens } from './support/contrast';

const css = readFileSync(path.join(import.meta.dirname, '../src/styles/globals.css'), 'utf8');
const themeCss = readFileSync(
  createRequire(import.meta.url).resolve('tailwindcss/theme.css'),
  'utf8',
);
const palette = declarations(themeCss);

const statuses = ['active', 'interview', 'offer', 'rejected', 'ghosted', 'archived'] as const;
const textPairs: [fg: string, bg: string][] = [
  ['--foreground', '--background'],
  ['--card-foreground', '--card'],
  ['--muted-foreground', '--muted'],
  ['--muted-foreground', '--background'],
  ['--primary-foreground', '--primary'],
  ['--destructive', '--background'],
  ['--destructive-foreground', '--destructive'],
  ...statuses.flatMap((s): [string, string][] => [
    [`--status-${s}`, '--background'],
    [`--status-${s}`, '--card'],
  ]),
];

describe.each([':root', '.dark'])('%s tokens', (selector) => {
  const tokens = resolveTokens(css, selector, palette);
  const get = (name: string) => {
    const value = tokens[name];
    if (value === undefined) throw new Error(`${selector} misses ${name}`);
    return value;
  };

  it.each(textPairs)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrastRatio(get(fg), get(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('--ring on --background ≥ 3:1', () => {
    expect(contrastRatio(get('--ring'), get('--background'))).toBeGreaterThanOrEqual(3);
  });
});

it('regression: slate-500 on slate-100 fails AA (why --muted-foreground is slate-600, 10 §8)', () => {
  const p = (name: string) => palette[name] ?? '';
  expect(contrastRatio(p('--color-slate-500'), p('--color-slate-100'))).toBeLessThan(4.5);
});
