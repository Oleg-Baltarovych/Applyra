import {
  STALE_DAYS_LIMITS,
  UpdateUserSettings,
  type UserSettings,
  ValidationIssue,
} from '@applyra/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useMemo, useState } from 'react';
import { Controller, type FieldError, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { describeError } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { isApiRequestError } from '@/lib/api/errors';
import { useUpdateSettings } from '../api/settings';
import { timeZoneOptions } from './time-zones';

type FormValues = z.input<typeof UpdateUserSettings>;
type StaleField = keyof typeof STALE_DAYS_LIMITS;
const STALE_FIELDS = Object.keys(STALE_DAYS_LIMITS).filter(
  (key): key is StaleField => key in STALE_DAYS_LIMITS,
);

const daysMessage = (name: StaleField) =>
  `Enter a whole number between ${STALE_DAYS_LIMITS[name].min} and ${STALE_DAYS_LIMITS[name].max}`;

/**
 * Contracts rules + "a cleared day field is an error": an empty number input becomes `undefined` (setValueAs), which
 * the optional PATCH schema would accept as "not provided" — but the form always holds every field.
 */
const PreferencesSchema = UpdateUserSettings.superRefine((value, ctx) => {
  for (const name of STALE_FIELDS) {
    if (value[name] === undefined) ctx.addIssue({ code: 'custom', path: [name], message: '' });
  }
});

/** '' (cleared / not a number) → undefined; anything else → number, range-checked by the schema. */
const toDays = (raw: unknown) => (raw === '' || raw == null ? undefined : Number(raw));

const FIELDS = [
  'timezone',
  'staleFollowUpDays',
  'staleDaysAfterInterview',
  'staleGhostDays',
  'hotkeysEnabled',
] as const satisfies readonly (keyof FormValues)[];
type Field = (typeof FIELDS)[number];
const isField = (path: string): path is Field => FIELDS.some((field) => field === path);

const toFormValues = (settings: UserSettings): FormValues => ({
  timezone: settings.timezone,
  staleFollowUpDays: settings.staleFollowUpDays,
  staleDaysAfterInterview: settings.staleDaysAfterInterview,
  staleGhostDays: settings.staleGhostDays,
  hotkeysEnabled: settings.hotkeysEnabled,
});

const DAY_FIELDS: { name: StaleField; label: string }[] = [
  { name: 'staleFollowUpDays', label: 'Follow up after (days)' },
  { name: 'staleDaysAfterInterview', label: 'Follow up after an interview (days)' },
  { name: 'staleGhostDays', label: 'Suggest "ghosted" after (days)' },
];

const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined;

function FieldErrorText({
  id,
  error,
  fallback,
}: {
  id: string;
  error: FieldError | undefined;
  /** Shown for client-side errors instead of the raw Zod text; server messages are shown as sent. */
  fallback?: string;
}) {
  if (!error) return null;
  const message = error.type !== 'server' && fallback ? fallback : error.message;
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Settings → Preferences (FR-PROF-01, 10 §6.2): RHF + contracts `UpdateUserSettings`, sends only the changed fields,
 * server VALIDATION_ERROR issues land on their fields, anything else on the form. The form follows the `me` cache
 * (e.g. the first-sign-in timezone push) without discarding the user's unsaved edits.
 */
export function PreferencesForm({ settings }: { settings: UserSettings }) {
  const id = useId();
  const values = useMemo(() => toFormValues(settings), [settings]);
  const zones = useMemo(() => timeZoneOptions(settings.timezone), [settings.timezone]);
  const { mutateAsync } = useUpdateSettings();
  const [saved, setSaved] = useState(false);
  const {
    control,
    formState: { dirtyFields, errors, isDirty, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<FormValues, unknown, UpdateUserSettings>({
    resolver: zodResolver(PreferencesSchema),
    values,
    resetOptions: { keepDirtyValues: true },
  });

  async function onSubmit(parsed: UpdateUserSettings) {
    setSaved(false);
    const changed = FIELDS.filter((field) => dirtyFields[field]);
    if (changed.length === 0) return;
    try {
      // Re-parse the picked subset: keeps the patch typed without casting a dynamic object.
      const patch = UpdateUserSettings.parse(
        Object.fromEntries(changed.map((field) => [field, parsed[field]])),
      );
      reset(toFormValues(await mutateAsync(patch)));
      setSaved(true);
    } catch (error) {
      const issues = isApiRequestError(error)
        ? ValidationIssue.array().safeParse(error.details)
        : undefined;
      if (isApiRequestError(error) && error.code === 'VALIDATION_ERROR' && issues?.success) {
        let focused = false;
        for (const issue of issues.data) {
          if (isField(issue.path)) {
            setError(
              issue.path,
              { type: 'server', message: issue.message },
              { shouldFocus: !focused },
            );
            focused = true;
          } else setError('root.serverError', { type: 'server', message: issue.message });
        }
        return;
      }
      const { title, message } = describeError(error);
      setError('root.serverError', { type: 'server', message: `${title}. ${message}` });
    }
  }

  const headingId = `${id}-heading`;
  const tzId = `${id}-timezone`;
  const hotkeysId = `${id}-hotkeys`;
  return (
    <section aria-labelledby={headingId} className="flex max-w-md flex-col gap-4">
      <h2 id={headingId} className="text-lg font-semibold">
        Preferences
      </h2>
      <form
        aria-labelledby={headingId}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={tzId}>Time zone</Label>
          <select
            id={tzId}
            aria-invalid={errors.timezone ? true : undefined}
            aria-describedby={describedBy(`${tzId}-hint`, !!errors.timezone && `${tzId}-error`)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive"
            {...register('timezone')}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p id={`${tzId}-hint`} className="text-sm text-muted-foreground">
            Dates and reminders follow this zone.
          </p>
          <FieldErrorText id={`${tzId}-error`} error={errors.timezone} />
        </div>

        {DAY_FIELDS.map(({ name, label }) => {
          const fieldId = `${id}-${name}`;
          const { min, max } = STALE_DAYS_LIMITS[name];
          const error = errors[name];
          return (
            <div key={name} className="flex flex-col gap-2">
              <Label htmlFor={fieldId}>{label}</Label>
              <Input
                id={fieldId}
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step={1}
                className="w-28 tabular-nums"
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy(`${fieldId}-hint`, !!error && `${fieldId}-error`)}
                {...register(name, { setValueAs: toDays })}
              />
              <p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">
                {min}–{max} days
              </p>
              <FieldErrorText id={`${fieldId}-error`} error={error} fallback={daysMessage(name)} />
            </div>
          );
        })}

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="hotkeysEnabled"
              render={({ field }) => (
                <Switch
                  id={hotkeysId}
                  ref={field.ref}
                  name={field.name}
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-describedby={`${hotkeysId}-hint`}
                />
              )}
            />
            <Label htmlFor={hotkeysId}>Keyboard shortcuts</Label>
          </div>
          <p id={`${hotkeysId}-hint`} className="text-sm text-muted-foreground">
            Single-key shortcuts on all your devices; ⌘K / Ctrl+K stays on.
          </p>
        </div>

        {errors.root?.serverError && (
          <p role="alert" className="text-sm text-destructive">
            {errors.root.serverError.message}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!isDirty || isSubmitting} aria-busy={isSubmitting}>
            Save preferences
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {saved && !isDirty ? 'Preferences saved' : ''}
          </p>
        </div>
      </form>
    </section>
  );
}
