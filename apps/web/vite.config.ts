import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Root env file (cp .env.example .env); only VITE_* is exposed to the bundle (CONTEXT §6 M0-04).
  envDir: '../..',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // Origin must equal WEB_ORIGIN exactly (api CORS/CSRF): localhost, not 127.0.0.1 (a different site for cookies).
  server: { host: 'localhost', port: 5173, strictPort: true },
  preview: { host: 'localhost', port: 5173, strictPort: true },
});
