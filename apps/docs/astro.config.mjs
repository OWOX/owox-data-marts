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
      title: 'OWOX Data Marts',
      favicon: 'favicon.png',
      logo: {
        src: './public/logo.svg',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/OWOX/owox-data-marts' },
      ],
      sidebar: [
        { label: 'Intro', link: '/' },
        {
          label: 'Getting started',
          items: ['docs/getting-started/quick-start', 'docs/getting-started/editions'],
        },
        {
          label: 'Connectors',
          items: [
            {
              label: 'Sources',
              autogenerate: { directory: 'packages/connectors/src/sources' },
            },
            {
              label: 'Storages',
              autogenerate: { directory: 'packages/connectors/src/storages' },
            },
          ],
        },
        {
          label: 'Contributing',
          items: [
            {
              label: 'Repository',
              autogenerate: { directory: 'docs/contributing/repository' },
              collapsed: true,
            },
            {
              label: 'Connectors',
              items: [
                'packages/connectors/environment-adapter',
                'packages/connectors/contributing',
                'packages/connectors/publishing',
              ],
              collapsed: true,
            },
            { label: 'Documentation', autogenerate: { directory: 'apps/docs' }, collapsed: true },
            { label: 'CLI Application', autogenerate: { directory: 'apps/owox' }, collapsed: true },
            { label: 'Web Application', autogenerate: { directory: 'apps/web' }, collapsed: true },
            {
              label: 'Backend Application',
              autogenerate: { directory: 'apps/backend' },
              collapsed: true,
            },
            {
              label: 'Connector Runner',
              autogenerate: { directory: 'packages/connector-runner' },
              collapsed: true,
            },
            { label: 'Licenses', autogenerate: { directory: 'licenses' }, collapsed: true },
          ],
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
