import { useQuery } from '@tanstack/react-query';
import { DelayedSkeleton } from '@/components/DelayedSkeleton';
import { ErrorState } from '@/components/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { meQuery } from '@/features/auth';

/** /settings (M0-12a): the signed-in account from GET /me. Preferences/account pages arrive with M0-12b. */
export function SettingsPage() {
  const { data, error, isPending, refetch } = useQuery(meQuery);
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      {isPending ? (
        <DelayedSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>
              <h2>Account</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{data.user.name}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{data.user.email}</dd>
            </dl>
          </CardContent>
        </Card>
      )}
    </>
  );
}
