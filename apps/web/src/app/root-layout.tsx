import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useMatches } from 'react-router';

/** `handle` of a route: the page title (document.title = `<title> · Applyra`). */
export type RouteHandle = { title: string };

const hasTitle = (handle: unknown): handle is RouteHandle =>
  typeof handle === 'object' && handle !== null && typeof Object(handle).title === 'string';

/**
 * Root layout: per-route document.title, and on client-side navigation focus moves to the new page's h1 so screen
 * readers announce it (WCAG 2.4.3); the initial page load keeps the browser's default focus.
 */
export function RootLayout() {
  const { pathname } = useLocation();
  const title = useMatches()
    .map((match) => match.handle)
    .filter(hasTitle)
    .at(-1)?.title;
  const previousPath = useRef(pathname);

  useEffect(() => {
    document.title = title ? `${title} · Applyra` : 'Applyra';
  }, [title]);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const heading = document.querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [pathname]);

  return <Outlet />;
}
