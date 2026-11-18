import { isRouteErrorResponse, useRevalidator, useRouteError } from 'react-router';
import { ErrorState } from '@/components/ErrorState';
import { isApiRequestError } from '@/lib/api/errors';
import { NotFound } from './not-found';

/**
 * errorElement of every route (10 §4.2): 404 → Not found screen, otherwise ErrorState with Retry (re-runs loaders).
 * `standalone={false}` for routes rendered inside the shell's <main> (no nested landmark, h2 heading).
 */
export function RouteError({ standalone = true }: { standalone?: boolean }) {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const notFound =
    (isRouteErrorResponse(error) && error.status === 404) ||
    (isApiRequestError(error) && error.code === 'NOT_FOUND');
  if (notFound) return <NotFound standalone={standalone} />;
  const state = (
    <ErrorState
      error={error}
      headingLevel={standalone ? 1 : 2}
      onRetry={() => void revalidator.revalidate()}
    />
  );
  return standalone ? <main>{state}</main> : state;
}
