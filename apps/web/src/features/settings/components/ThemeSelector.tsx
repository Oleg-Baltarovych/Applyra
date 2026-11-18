import { useEffect, useId, useState } from 'react';
import { THEMES, type Theme, readTheme, saveTheme, watchSystemTheme } from '@/lib/theme';

const LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** Theme (10 §8): client-only, stored on this device and applied immediately — no Save button. */
export function ThemeSelector() {
  const id = useId();
  const [theme, setTheme] = useState<Theme>(readTheme);

  // theme-init.js applies `system` once per load; while this page is open, follow live OS changes too.
  useEffect(() => (theme === 'system' ? watchSystemTheme() : undefined), [theme]);

  function choose(next: Theme) {
    setTheme(next);
    saveTheme(next);
  }

  return (
    <fieldset aria-describedby={`${id}-hint`} className="flex max-w-md flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Theme</legend>
      <div className="flex gap-4">
        {THEMES.map((value) => (
          <label key={value} className="flex items-center gap-2 py-2 text-sm">
            <input
              type="radio"
              name={`${id}-theme`}
              value={value}
              checked={theme === value}
              onChange={() => choose(value)}
              className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {LABELS[value]}
          </label>
        ))}
      </div>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        Saved on this device.
      </p>
    </fieldset>
  );
}
