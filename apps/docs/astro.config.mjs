// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import rehypeExternalLinks from 'rehype-external-links';

export default defineConfig({
  integrations: [
    starlight({
      title: 'OWOX Docs',
      favicon: './favicon.png',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/OWOX/owox-data-marts' },
      ],
      sidebar: [
        {
          label: 'Getting started',
          items: [
            { label: 'OWOX Data Marts', link: '/' },
            { label: 'Monorepo Structure', link: '/docs/monorepo-structure' },
          ],
        },
        {
          label: 'Apps',
          items: [
            { label: 'Backend', autogenerate: { directory: '/apps/backend', collapsed: true } },
            { label: 'Docs', autogenerate: { directory: '/apps/docs' }, collapsed: true },
            { label: 'Web', autogenerate: { directory: '/apps/web' }, collapsed: true },
          ],
          collapsed: true,
        },
        {
          label: 'Packages',
          items: [
            {
              label: 'Connector Runner',
              autogenerate: { directory: '/packages/connector-runner', collapsed: true },
            },
            {
              label: 'Connectors',
              items: [
                { label: 'Project Guidline', link: '/packages/connectors/guideline' },
                { label: 'Contributing', link: '/packages/connectors/contributing' },
                {
                  label: 'Sources',
                  autogenerate: { directory: '/packages/connectors/src/sources', collapsed: true },
                },
              ],
              collapsed: true,
            },
          ],
          collapsed: true,
        },
      ],
    }),
  ],
  markdown: {
    rehypePlugins: [
      [
        rehypeExternalLinks,
        {
          target: '_blank',
          rel: ['noopener', 'noreferrer'],
        },
      ],
    ],
    remarkPlugins: [],
  },
});
