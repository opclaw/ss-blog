// @ts-check
import { defineConfig } from 'astro/config';

// Сайт статический: на выходе чистые .html с теми же адресами, что и сейчас
// (/services.html, /blog/ii-dlya-hr.html, /blog/index.html) — SEO-адреса не меняются.
export default defineConfig({
  site: 'https://smartsolutions.today',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'preserve',        // services.astro → services.html, blog/index.astro → blog/index.html
    inlineStylesheets: 'never',
  },
  compressHTML: false,         // читаемый HTML, удобно сверять с оригиналом
  devToolbar: { enabled: false },
  server: { host: true, port: 4321 },
  vite: { server: { allowedHosts: true } },
});
