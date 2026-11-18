import { useEffect, useState } from 'react';
import { Skeleton } from './ui/skeleton';

/** Loading placeholder shown only after `delayMs` (10 §7.1: no flash for fast loads). */
export function DelayedSkeleton({ delayMs = 150 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label="Loading"
      className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6"
    >
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
