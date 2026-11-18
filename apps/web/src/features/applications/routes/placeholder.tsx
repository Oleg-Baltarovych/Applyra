import { KanbanSquare } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

/**
 * Placeholder until M1 (user decision Q1, 2026-11-18 — deliberate exception to "no UI without backend"):
 * static text only, no data, no actions. Replaced by the M1 Applications tasks.
 */
export function ApplicationsPlaceholder() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">Applications</h1>
      <EmptyState
        icon={KanbanSquare}
        title="Arrives with M1"
        description="The application board and table are built in the next milestone."
      />
    </>
  );
}
