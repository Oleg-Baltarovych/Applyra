import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = { icon: LucideIcon; title: string; description: string; action?: ReactNode };

/** Empty state (10 §7.1): icon + one sentence + optional primary CTA. */
export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <section
      aria-labelledby="empty-state-title"
      className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center"
    >
      <Icon aria-hidden="true" className="size-10 text-muted-foreground" />
      <h2 id="empty-state-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="text-muted-foreground">{description}</p>
      {action}
    </section>
  );
}
