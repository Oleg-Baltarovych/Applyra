import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';

/**
 * `*` route and API 404 on a route (no "foreign vs missing" distinction, 09 §2). `standalone` = rendered outside the
 * shell, so it owns the <main> landmark; inside the shell it must not nest a second one.
 */
export function NotFound({ standalone = true }: { standalone?: boolean }) {
  const Wrapper = standalone ? 'main' : 'div';
  return (
    <Wrapper className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">This page or item does not exist.</p>
      <Link to="/applications" className={buttonVariants({ variant: 'outline' })}>
        Go to Applications
      </Link>
    </Wrapper>
  );
}
