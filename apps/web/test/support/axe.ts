// axe-core directly (vitest-axe is unmaintained): fails with the list of violated rules.
import axe from 'axe-core';
import { expect } from 'vitest';

export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    // jsdom has no layout/paint: colour contrast is covered by test/contrast.test.ts on the tokens.
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
