import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Production-only Content-Security-Policy (the dev server needs inline scripts for hot reload).
 * - scripts: only files served with the site – no inline code, no third-party scripts
 * - connections: HTTPS APIs (Modrinth, CurseForge or a user-configured proxy, loader metadata)
 *   plus localhost for a locally running proxy
 * - images: mod icons and screenshots come from many CDNs, so any HTTPS host
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'modpacker-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  // Relative base so the static build works from any sub-path (e.g. GitHub Pages).
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
