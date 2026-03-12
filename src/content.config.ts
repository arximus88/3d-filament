import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const socials = z.object({
  telegram: z.string().url().optional(),
  instagram: z.string().url().optional(),
}).optional();

const companies = defineCollection({
  loader: file('src/data/companies.json'),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['manufacturer', 'shop']),
    city: z.string(),
    url: z.string().url(),
    materials: z.array(z.string()),
    phone: z.string().optional(),
    socials,
    description: z.string(),
  }),
});

export const collections = { companies };
