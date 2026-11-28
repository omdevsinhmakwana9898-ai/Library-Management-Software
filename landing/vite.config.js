import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const SEO_PAGES = {
  '/login': '/login/index.html',
  '/signup': '/signup/index.html',
  '/free-trial': '/free-trial/index.html',
  '/pricing': '/pricing/index.html',
};

function seoPageFallback() {
  const rewrite = (req, _res, next) => {
    const [path, query] = String(req.url || '').split('?');
    const target = SEO_PAGES[path];
    if (target) req.url = query ? `${target}?${query}` : target;
    next();
  };
  return {
    name: 'seo-page-fallback',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const siteUrl = (env.VITE_SITE_URL || 'https://mylibraryos.in').replace(/\/$/, '');
  return {
    plugins: [
      react(),
      {
        name: 'site-url',
        transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
      },
      seoPageFallback(),
    ],
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 1100,
      modulePreload: false, // do not fetch the three.js hero chunk on first paint
    },
  };
});
