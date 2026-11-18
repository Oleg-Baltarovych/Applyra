import { CalendarCheck } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

/** Placeholder until M1 (user decision Q1, 2026-11-18): static text only, no data, no actions. */
export function TodayPlaceholder() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">Today</h1>
      <EmptyState
        icon={CalendarCheck}
        title="Arrives with M1"
        description="Next actions and reminders are built in the next milestone."
      />
    </>
  );
}
