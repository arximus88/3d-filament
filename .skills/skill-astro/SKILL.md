---
name: skill-astro
description: Astro.build development guide for static site generation (SSG), content collections, and deployment to Cloudflare Pages. Use when building or refactoring websites with Astro.
---

# Astro.build Development Skill

This skill provides specialized workflows and knowledge for building high-performance websites with Astro.

## Core Concepts

Astro is a server-first web framework that favors Static Site Generation (SSG).

- **Islands Architecture**: Use UI frameworks (React, Svelte, Vue) only for interactive parts.
- **Content Collections**: Type-safe Markdown/MDX management.
- **SSG by Default**: `output: 'static'` is the default.

## Workflows

### 1. Initializing an Astro Project
```bash
bun create astro@latest
```
Prefer `Bun` as the runtime and package manager in this project.

### 2. Configuring Content Collections
1. Create `src/content.config.ts`.
2. Define collections using `defineCollection` and `zod` for schema validation.
3. Use the `glob` loader for local Markdown/MDX files.

```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const companies = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/companies' }),
  schema: z.object({
    name: z.string(),
    type: z.enum(['manufacturer', 'shop']),
    website: z.string().url(),
    // ... other fields
  }),
});

export const collections = { companies };
```

### 3. Creating Dynamic Routes (SSG)
In `src/pages/[slug].astro`, you must export `getStaticPaths`.

```astro
---
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const companies = await getCollection('companies');
  return companies.map(entry => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
---
<h1>{entry.data.name}</h1>
<Content />
```

### 4. Deployment to Cloudflare Pages
Astro can be deployed as a static site or using the `@astrojs/cloudflare` adapter for SSR features.

For static deployment:
```bash
bun run build
npx wrangler pages deploy ./dist
```

## References

- [Astro Documentation](https://docs.astro.build/)
- [Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Cloudflare Deployment](https://docs.astro.build/en/guides/deploy/cloudflare/)
