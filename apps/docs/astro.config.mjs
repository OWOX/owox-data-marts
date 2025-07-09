// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import rehypeExternalLinks from 'rehype-external-links';
import starlightAutoSidebar from 'starlight-auto-sidebar';
import { getConfig } from './scripts/env-config.js';

const { site, base } = getConfig();

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'OWOX Docs',
      favicon: 'favicon.png',
      logo: {
        src: 'logo.svg',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/OWOX/owox-data-marts' },
      ],
      sidebar: [
        {
          label: 'Getting started',
          items: [
            { label: 'OWOX Data Marts', link: '/' },
            // { label: 'License', link: 'license' },
          ],
        },
        { label: 'Licenses', autogenerate: { directory: 'licenses' }, collapsed: true },
        { label: 'Documentation', autogenerate: { directory: 'docs' }, collapsed: true },
        {
          label: 'Apps',
          items: [
            { label: 'OWOX', autogenerate: { directory: 'apps/owox' }, collapsed: true },
            { label: 'Backend', autogenerate: { directory: 'apps/backend', collapsed: true } },
            { label: 'Web', autogenerate: { directory: 'apps/web' }, collapsed: true },
            { label: 'Docs', autogenerate: { directory: 'apps/docs' }, collapsed: true },
          ],
          collapsed: true,
        },
        {
          label: 'Packages',
          items: [
            {
              label: 'Connectors',
              items: [
                'packages/connectors/guideline',
                'packages/connectors/contributing',
                {
                  label: 'Sources',
                  autogenerate: { directory: 'packages/connectors/src/sources', collapsed: true },
                },
                {
                  label: 'Storages',
                  autogenerate: { directory: 'packages/connectors/src/storages', collapsed: true },
                },
              ],
              collapsed: true,
            },
            {
              label: 'Connector Runner',
              autogenerate: { directory: 'packages/connector-runner', collapsed: true },
            },
          ],
          collapsed: true,
        },
      ],
      plugins: [starlightAutoSidebar()],
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
