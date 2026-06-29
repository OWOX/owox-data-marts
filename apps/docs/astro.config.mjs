// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import rehypeExternalLinks from 'rehype-external-links';
import starlightAutoSidebar from 'starlight-auto-sidebar';
import starlightLinksValidator from 'starlight-links-validator';
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
      customCss: ['./src/styles/custom.css'],
      components: {
        PageFrame: './src/components/starlight/PageFrame.astro',
        PageSidebar: './src/components/starlight/PageSidebar.astro',
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
          items: [
            'docs/getting-started/quick-start',
            'docs/getting-started/core-concepts',
            {
              label: 'Editions',
              items: [
                'docs/editions/owox-cloud-editions',
                'docs/editions/self-managed-editions',
                'docs/editions/agency',
              ],
            },
            {
              label: 'Billing',
              items: [{ autogenerate: { directory: 'docs/getting-started/billing' } }],
            },
            {
              label: 'Deployment Guide',
              items: [{ autogenerate: { directory: 'docs/getting-started/deployment-guide' } }],
            },
            {
              label: 'Setup Guide',
              items: [
                'docs/getting-started/setup-guide/insights',
                'docs/getting-started/setup-guide/extension-data-marts',
                'docs/getting-started/setup-guide/connector-data-mart',
                'docs/getting-started/setup-guide/sql-data-mart',
                'docs/getting-started/setup-guide/table-data-mart',
                'docs/getting-started/setup-guide/view-data-mart',
                'docs/getting-started/setup-guide/pattern-data-mart',
                'docs/getting-started/setup-guide/joinable-data-marts',
                'docs/getting-started/setup-guide/output-controls',
                'docs/getting-started/setup-guide/report-aggregations',
                'docs/getting-started/setup-guide/connector-triggers',
                'docs/getting-started/setup-guide/report-triggers',
                'docs/getting-started/setup-guide/mcp',
                {
                  label: 'Self-Managed Authentication',
                  collapsed: true,
                  items: [
                    {
                      autogenerate: {
                        directory: 'docs/getting-started/setup-guide/members-management',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Project Settings',
          items: [
            {
              label: 'Members Management',
              items: [
                'docs/project/members',
                'docs/project/roles-and-permissions',
                'docs/project/ownership-and-sharing',
                'docs/project/contexts',
              ],
            },
            {
              label: 'Notifications',
              items: [
                'docs/notifications/notification-settings',
                'docs/notifications/email',
                'docs/notifications/webhooks',
              ],
            },
          ],
        },
        {
          label: 'Destinations',
          items: [
            'docs/destinations/manage-destinations',
            {
              label: 'Supported Destinations',
              items: [{ autogenerate: { directory: 'docs/destinations/supported-destinations' } }],
            },
          ],
        },
        {
          label: 'Storages',
          items: [
            'docs/storages/manage-storages',
            {
              label: 'Supported Storages',
              items: [{ autogenerate: { directory: 'docs/storages/supported-storages' } }],
            },
          ],
        },
        {
          label: 'Sources',
          items: [{ autogenerate: { directory: 'packages/connectors/src/sources' } }],
        },
        {
          label: 'API',
          items: [
            'docs/api',
            'docs/api/api-keys',
            'docs/api/owox-ctl',
            'docs/api/api-client',
            'docs/api/openapi',
          ],
        },
        {
          label: 'Contributing',
          items: [
            {
              label: 'Repository',
              items: [{ autogenerate: { directory: 'docs/contributing/repository' } }],
              collapsed: true,
            },
            {
              label: 'Connectors',
              items: [
                'packages/connectors/contributing',
                'packages/connectors/creating-connector',
                'packages/connectors/publishing',
              ],
              collapsed: true,
            },
            {
              label: 'Documentation',
              items: [{ autogenerate: { directory: 'apps/docs' } }],
              collapsed: true,
            },
            {
              label: 'CLI Application',
              items: [
                'apps/owox/readme',
                'apps/owox/contributing',
                'apps/owox/publishing',
                'apps/owox/src/web/readme',
              ],
              collapsed: true,
            },
            {
              label: 'Web Application',
              items: [{ autogenerate: { directory: 'apps/web' } }],
              collapsed: true,
            },
            {
              label: 'Backend Application',
              items: [
                'apps/backend/readme',
                'apps/backend/modular-conventions',
                'apps/backend/publishing',
                'apps/backend/src/common/scheduler/readme',
                'apps/backend/src/migrations/readme',
              ],
              collapsed: true,
            },
            {
              label: 'Licenses',
              items: [{ autogenerate: { directory: 'licenses' } }],
              collapsed: true,
            },
            'docs/changelog',
          ],
        },
      ],
      plugins: [
        starlightAutoSidebar(),
        // Fails `astro build` on broken internal links and missing heading
        // anchors, so CI (test-docs.yml) catches dead links before deploy.
        starlightLinksValidator({
          // localhost URLs are intentional examples in setup/deployment guides.
          errorOnLocalLinks: false,
          // Repo-file links (e.g. workflow YAML) are valid on GitHub but have no
          // page on the docs site; skip them rather than rewrite to blob URLs.
          exclude: ['/.github/**'],
        }),
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
