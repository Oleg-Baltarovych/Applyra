import { useQuery } from '@tanstack/react-query';
import { DelayedSkeleton } from '@/components/DelayedSkeleton';
import { ErrorState } from '@/components/ErrorState';
import { meQuery } from '@/features/auth';
import { PreferencesForm } from '../components/PreferencesForm';
import { ThemeSelector } from '../components/ThemeSelector';

/** /settings/preferences (FR-PROF-01): server-side settings form + device-local theme. */
export function PreferencesPage() {
  const { data, error, isPending, refetch } = useQuery(meQuery);
  if (isPending) return <DelayedSkeleton />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <div className="flex flex-col gap-8">
      <PreferencesForm settings={data.settings} />
      <ThemeSelector />
    </div>
  );
}
