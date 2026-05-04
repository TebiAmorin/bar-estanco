// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://barestanco.es',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [sitemap({
    filter: (page) =>
      !page.includes('/aviso-legal') &&
      !page.includes('/privacidad') &&
      !page.includes('/admin')
  })]
});