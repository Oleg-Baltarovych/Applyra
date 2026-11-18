import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/settings/preferences', label: 'Preferences' },
  { to: '/settings/account', label: 'Account' },
] as const;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
  );

/** /settings/* (10 §2.1): page heading + sub-navigation (aria-current via NavLink); the active tab renders below. */
export function SettingsLayout() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      <nav aria-label="Settings" className="mb-6 flex gap-1 border-b pb-2">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={tabClass}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
