import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useId } from 'react';
import { DelayedSkeleton } from '@/components/DelayedSkeleton';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { meQuery, useSignOut } from '@/features/auth';
import { formatDate } from '@/lib/format';

/** /settings/account (10 §2.1): who is signed in, since when (in the user's time zone), sign-out. */
export function AccountPage() {
  const headingId = useId();
  const { data, error, isPending, refetch } = useQuery(meQuery);
  const { signOut, signingOut, failed } = useSignOut();
  if (isPending) return <DelayedSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const { user, settings } = data;
  return (
    <section aria-labelledby={headingId} className="flex max-w-md flex-col gap-4">
      <h2 id={headingId} className="text-lg font-semibold">
        Account
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd className="min-w-0 break-words">{user.name}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd className="min-w-0 break-words">{user.email}</dd>
        <dt className="text-muted-foreground">Member since</dt>
        <dd>
          <time dateTime={user.createdAt}>
            {formatDate(user.createdAt, { timeZone: settings.timezone })}
          </time>
        </dd>
      </dl>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => void signOut()} disabled={signingOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
        {failed && (
          <span role="alert" className="text-sm text-destructive">
            Sign-out failed, try again
          </span>
        )}
      </div>
    </section>
  );
}
