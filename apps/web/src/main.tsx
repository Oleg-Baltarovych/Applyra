import '@/styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { createBrowserRouter } from 'react-router';
import { createApp } from './app/create-app';
import { Providers } from './app/providers';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing in index.html');

const { queryClient, router } = createApp((routes) => createBrowserRouter(routes));

createRoot(root).render(
  <StrictMode>
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
