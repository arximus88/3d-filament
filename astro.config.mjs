import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The site's public origin. Everything that needs an absolute URL
// (canonical, sitemap, robots.txt, llms.txt, structured data) derives it
// from here, so moving to another domain is this one line.
const SITE = 'https://filaments.borys.app';

export default defineConfig({
  site: SITE,
  integrations: [
    sitemap({
      // Every page is rebuilt from fresh data on each deploy.
      lastmod: new Date(),
    }),
  ],
});
