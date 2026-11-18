import { LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/features/auth';
import { useBrowserTimezoneSync } from '@/features/settings';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/applications', label: 'Applications' },
  { to: '/today', label: 'Today' },
  { to: '/settings', label: 'Settings' },
] as const;

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
  );

/** Signed-in layout: skip link, main navigation (aria-current via NavLink), sign-out, first-sign-in timezone push. */
export function AppShell() {
  const { signOut, signingOut, failed: signOutFailed } = useSignOut();
  useBrowserTimezoneSync();

  return (
    <div className="min-h-svh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-2 focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        Skip to content
      </a>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-semibold">Applyra</span>
          <nav aria-label="Main" className="flex gap-1">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {signOutFailed && (
              <span role="alert" className="text-sm text-destructive">
                Sign-out failed, try again
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => void signOut()} disabled={signingOut}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6 outline-none">
        <Outlet />
      </main>
    </div>
  );
}
