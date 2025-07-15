// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import rehypeExternalLinks from 'rehype-external-links';
import starlightAutoSidebar from 'starlight-auto-sidebar';
import { getConfig } from './scripts/env-config.js';

const { site, base, gtmId } = getConfig();

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
      components: {
        PageFrame: './src/components/starlight/PageFrame.astro',
      },
      head: gtmId
        ? [
            {
              tag: 'script',
              content: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`,
            },
          ]
        : [],
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
