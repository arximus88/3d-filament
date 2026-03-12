import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://3d-filament.pages.dev',
  integrations: [sitemap()],
});
