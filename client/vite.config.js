import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Backend origin used for the /api and /ws proxies. Override with
// VITE_BACKEND_URL if your server runs somewhere else.
const BACKEND_TARGET = process.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Shared proxy so relative '/api' and '/ws' calls reach the Express backend
// in BOTH `vite dev` and `vite preview` (production build). Without this,
// requests to /api fall through to the SPA and return index.html, which
// breaks JSON parsing with "Unexpected token '<', <!doctype ...".
const proxy = {
  '/api': {
    target: BACKEND_TARGET,
    changeOrigin: true
  },
  '/ws': {
    target: BACKEND_TARGET,
    ws: true
  }
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy }
});
