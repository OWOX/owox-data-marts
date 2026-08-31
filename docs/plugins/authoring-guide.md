# Plugin authoring guide

Use this guide while building and maintaining an OWOX Data Marts plugin. It defines the production
plugin contract, SDK usage, UI foundation, deployment, releases, publication, and updates.

If the repository and development tools are not ready yet, first
[prepare your plugin project](./project-setup.md).

## Scaffold the plugin

Create a React and TypeScript application with Vite in the prepared repository:

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install @owox/plugin-sdk lucide-react
npm run build
```

A simple plugin can use this project structure:

```text
.
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── src/
│   ├── components/
│   │   └── ui/
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── .gitignore
├── AGENTS.md
├── index.html
├── package.json
├── plugin.json
├── tsconfig.json
└── vite.config.ts
```

Keep reusable controls in `src/components/ui/`. Vite's default build output is `dist/`; GitHub
Pages publishes that directory. Keep `plugin.json` at the repository root: OWOX Data Marts reads
it from the GitHub Release commit rather than from the deployed page.

## Understand the plugin runtime

An OWOX Data Marts plugin is a small web application hosted outside OWOX Data Marts. OWOX opens
the application inside a protected frame and connects it to the installing member through
`@owox/plugin-sdk`.

### Security and trust model

These constraints follow from the plugin sandbox. No OWOX Data Marts setting relaxes them.

**The page runs in an opaque origin.** It has no cookies, `localStorage`, `sessionStorage`,
`IndexedDB`, or service workers. Keep short-lived state in memory. For state that must persist, use
[host-managed plugin collections](#persist-plugin-state-as-json-with-collections), or use your own
backend when collections do not fit the use case.

**Calls to your backend arrive with `Origin: null`.** The backend must answer
`Access-Control-Allow-Origin: *`, and it cannot authenticate requests with cookies. Pass an
identifier explicitly if the backend needs to know who is calling.

**Your assets are cross-origin to your page.** An opaque origin matches nothing, including the
host that served the page, so anything fetched in CORS mode needs `Access-Control-Allow-Origin: *`
from its server. This includes `<script type="module">`, fonts, and every `fetch` request. GitHub
Pages sends the required header; a plain static server may not. Without it, the page can load while
the browser blocks its module script and the plugin runs no code. A page with an inline script and
no assets does not encounter this issue.

**The entry page must be embeddable.** It must not send `X-Frame-Options`. If it sends a
`Content-Security-Policy` with `frame-ancestors`, the directive must permit OWOX Data Marts by
using `*`, `https:`, or the exact origin of the deployment. Publication checks this and refuses a
page that could not be displayed.

**The plugin never holds an OWOX credential.** Calls through `ctx.owox` are brokered by the host,
which attaches the member's token. Requests have the authority of the member who installed the
plugin—never more, and never on behalf of another member. Protected routes still apply their
server-side authorization and reject calls that member may not make.

Never place GitHub tokens, OWOX API keys, or other credentials in plugin source files,
`AGENTS.md`, coding-agent prompts, commits, or release notes. Plugin code must not read or store an
OWOX credential. Use `OWOX_API_KEY` only for `owox-ctl` or an external script running outside the
plugin.

- Add `.env` and `.env.*` to `.gitignore`; keep only a secret-free `.env.example` when useful.
- Let `gh` use its own authenticated credential store.
- Put backend secrets in the backend host's secret manager, never in Vite environment variables.
  Values exposed to browser code are public even when their names contain “secret.”

## Use the plugin SDK

Import `connect` from the [`@owox/plugin-sdk`](https://www.npmjs.com/package/@owox/plugin-sdk),
then use the context it returns:

```ts
import { connect } from '@owox/plugin-sdk';

const ctx = await connect();
const dataMarts = await ctx.owox.dataMarts.list();
```

`connect()` completes a handshake with the OWOX Data Marts host. It rejects outside an OWOX Data
Marts frame or if no host answers within 10 seconds.

| Context value | What it provides |
| --- | --- |
| `ctx.owox` | Authenticated [OWOX Data Marts API client](../api/api-client.md), supplied by [`@owox/plugin-sdk`](https://www.npmjs.com/package/@owox/plugin-sdk). Use the API client documentation to discover available methods. Do not install `@owox/api-client` or provide an API key inside a plugin; the SDK owns its transport, which cannot be replaced or inspected. |
| `ctx.collections(name)` | Provides a host-managed JSON collection declared by the current plugin version. |
| `ctx.ui.openExternal(url)` | Asks the host to open an external HTTPS address in a new tab. |
| `ctx.ui.navigate(path)` | Asks the host to navigate to a page inside OWOX Data Marts—for example, `/ui/${ctx.projectId}/data-marts/${id}`—in place of the plugin frame. Resolutions off the app's origin are refused. |
| `ctx.signal` | Aborts when the host tears the plugin down. |
| `ctx.userId`, `ctx.projectId`, `ctx.theme` | Provides display context without exposing tokens. The member's name and avatar are available through `ctx.owox.auth` when needed. |

See the [API client method reference](../api/api-client.md) and [Support Matrix](../api/coverage.md)
for currently supported calls. Requests time out after 30 seconds. Streamed reads do not, because
data traversals can run for minutes. At most 32 requests may be in flight at once.

### Low-level API escape hatch

Prefer the typed `ctx.owox` resources. For an endpoint that has no typed abstraction, the client
also exposes `getJson<T>(path, query?)`, `postJson<T>(path, body, accept?)`, `putJson<T>(path,
body)`, `patchJson<T>(path, body)`, `deleteJson<T = void>(path)`, and `getStream(path, query?)`.
The generic does not validate the response at runtime, so validate returned data yourself. Paths
must be root-relative `/api/...` and are limited to 2,048 characters; unsafe or redirecting paths
are refused.

## Make the plugin feel native

Plugins run in an iframe and do not inherit OWOX Data Marts styles. They must import and bundle
their own CSS. `@owox/ui` is an internal package, not a public plugin dependency, so do not import
it.

For now, keep a small UI foundation in the plugin repository. This makes the plugin independent
and can later be replaced by an official starter or a versioned plugin UI package without changing
the plugin contract.

Use semantic variables and the standard page structure in `src/styles.css`:

```css
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  --background: oklch(1 0 0);
  --foreground: oklch(0.3346 0.0123 279.25);
  --card: oklch(1 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.5148 0.0128 274.72);
  --border: oklch(0.922 0 0);
  --primary: oklch(0.6179 0.2295 250.87);
  --primary-foreground: oklch(0.985 0 0);
}

:root.dark {
  color-scheme: dark;
  --background: oklch(0.205 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.145 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --border: oklch(0.269 0 0);
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--background); color: var(--foreground); }
.dm-page { min-height: 100vh; }
.dm-page-header { padding: 1.5rem 3rem; }
.dm-page-header-title { margin: 0; font-size: 1.5rem; font-weight: 500; }
.dm-page-content { padding: 0 3rem 3rem; }
.dm-card { padding: 1rem; border: 1px solid var(--border); border-radius: 0.625rem; background: var(--card); }
.dm-muted { color: var(--muted-foreground); }

@media (max-width: 640px) {
  .dm-page-header { padding: 1rem 1.25rem; }
  .dm-page-content { padding: 0 1.25rem 1.25rem; }
}
```

Use those classes for the application shell:

```tsx
<div className="dm-page">
  <header className="dm-page-header">
    <h1 className="dm-page-header-title">Plugin name</h1>
  </header>
  <main className="dm-page-content">
    <section className="dm-card">Plugin content</section>
  </main>
</div>
```

After `connect()`, apply the host theme before rendering:

```ts
document.documentElement.classList.toggle('dark', ctx.theme === 'dark');
```

Keep reusable controls in `src/components/ui/`. Radix or shadcn-style primitives can be kept
locally, and [Lucide](https://lucide.dev/) is a good default for icons. Use semantic variables
instead of fixed colors, visible keyboard focus, accessible names, and responsive layouts. Every
data-driven screen should include loading, empty, error, and success states.

Do not depend on undocumented host HTML or CSS: it cannot cross the iframe boundary and may change
without notice.

## Define the plugin manifest

Add `plugin.json` at the repository root:

```json
{
  "name": "Example Plugin",
  "description": "What this plugin helps a member accomplish",
  "delivery": {
    "type": "remote",
    "url": "https://OWNER.github.io/PLUGIN_NAME/"
  }
}
```

Replace `OWNER` and `PLUGIN_NAME` after the first successful deployment. The URL must use HTTPS,
be publicly reachable without a sign-in prompt, and not resolve to a private or metadata network,
including through redirects.

The manifest contains the plugin-authored fields above. OWOX Data Marts derives plugin identity
from the GitHub repository and the current version from the eligible GitHub Release tag. Renaming
or transferring a repository does not create another plugin; two repositories with identical
contents are two different plugins.

There is no separate API-key or permissions list in `plugin.json`. The plugin can call only the
SDK-supported APIs, acting with the permissions of the member who installed it.

## Persist plugin state as JSON with collections

Use host-managed collections to persist plugin state that must survive reloads, browser changes,
or device changes. Collections are asynchronous and server-backed, so the same member can retrieve
their state in another browser or on another device.

> **Why collections instead of browser storage?** The plugin sandbox makes browser persistence
> unavailable. See the [security and trust model](#security-and-trust-model) for the restrictions.

Add every collection to the `collections` array in `plugin.json`. For example, a plugin can declare
private preferences with `scope: "member"`:

```json
{
  "collections": [
    {
      "name": "preferences",
      "scope": "member"
    }
  ]
}
```

Use a stable document ID for a preference or draft that has one current value:

```ts
interface Preferences {
  compactView: boolean;
  selectedTab: string;
}

const preferences = ctx.collections<Preferences>('preferences');

await preferences.put('current', { compactView: true, selectedTab: 'overview' });
const saved = await preferences.get('current');
const prefs = saved?.document ?? { compactView: false, selectedTab: 'overview' };
```

Choose the scope based on who owns the state:

| Scope | Visibility and namespace | Typical uses |
| --- | --- | --- |
| `member` | Private to the current member for this plugin and project. It is not shared with other project members or with the same member in another project. | Preferences, personal layouts, drafts, and last-used settings. This is the usual replacement for `localStorage`. |
| `project` | Shared by eligible members of the project. | Shared dashboards, configuration, and other collaborative state. |

Collection declarations are immutable in structure within a compatibility line. A release may add
collections and change action mappings, but cannot remove a collection or change its name, scope,
or entity binding — such a release is rejected and the previous version stays current; the reason
appears in the publisher diagnostics and on the plugin page. Opening a new line waives the check —
it is how a breaking collection change ships deliberately. From 1.0.0 on, the line is the major
version, so the declared break is a major bump. Below 1.0.0, where SemVer promises no stability,
the line narrows to the minor version: a 0.x plugin ships a breaking change by bumping the minor,
without leaving 0.x.

### Bind collection documents to OWOX entities

A `member`- or `project`-scoped collection can optionally bind each document to a `data-mart`,
`storage`, `destination`, or `report`. Binding does not change its visibility: member-scoped
documents remain private, while project-scoped documents remain shared with eligible project
members. OWOX checks the mapped existing action on every request. For a bound collection,
`parentId` is required on create and cannot change later.

Each operation mapping must use an action supported by the bound entity type:

| Entity type | Allowed action identifiers |
| --- | --- |
| `data-mart` | `SEE`, `USE`, `EDIT`, `DELETE`, `CONFIGURE_SHARING`, `MANAGE_OWNERS`, `MANAGE_TRIGGERS` |
| `storage`, `destination` | `SEE`, `USE`, `EDIT`, `DELETE`, `CONFIGURE_SHARING`, `MANAGE_OWNERS`, `COPY_CREDENTIALS` |
| `report` | `SEE`, `EDIT`, `DELETE`, `RUN` |

See [Actions and access by entity](../project/ownership-and-sharing.md#actions) for what each action
means and which members receive it.

```json
{
  "collections": [
    {
      "name": "dashboards",
      "scope": "project",
      "entityBinding": {
        "type": "data-mart",
        "actions": {
          "read": "SEE",
          "create": "SEE",
          "update": "SEE",
          "delete": "SEE"
        }
      }
    }
  ]
}
```

```ts
const dashboards = ctx.collections<Dashboard>('dashboards');

await dashboards.put('revenue', dashboard, { parentId: dataMartId });
const saved = await dashboards.get('revenue');
const page = await dashboards.list({ limit: 50 });
await dashboards.delete('revenue');
```

### Design collection data for network persistence

Collections store non-secret JSON only. Do not put credentials, access tokens, refresh tokens, or
other secrets in a document. Keep rapidly changing state in memory, then debounce or batch writes
instead of sending a request for every keystroke, drag event, or resize. Provide an in-memory
default while the initial collection read is loading, and handle network errors explicitly.

Platform limits are 1 MiB per document, 10,000 documents and 100 MiB per namespace, 500 MiB per
plugin and project, and 2 GiB across collections in a project. JSON may contain at most 100 nested
containers. List pages contain at most 100 documents and 4 MiB of JSON. Entity-bound collections
inspect at most 10 stored documents per request so authorization checks stay bounded. Such a page
can contain fewer items than requested, or no items, while still returning a non-null `nextCursor`;
continue until the cursor is null.

Collection data survives uninstall, suspension, and recoverable deletion. Documents bound to a
recoverably deleted parent are inaccessible until the parent is restored. There is no document
schema validation or automatic migration; the plugin owns compatibility of its JSON. Mutation and
authorization-denial audit records never include document bodies. They use rolling 90-day
retention and are additionally capped at 50,000 rows per plugin/project and 500,000 rows per
project, with the oldest records removed first.

## Deploy with GitHub Pages

[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
can host the plugin's static HTML, CSS, and JavaScript. A repository named `OWNER/PLUGIN_NAME`
normally receives this address:

```text
https://OWNER.github.io/PLUGIN_NAME/
```

### Configure Vite for the deployment path

Most plugins use the project-site address above. GitHub Pages serves that site below its repository
name, so update `vite.config.ts` to make scripts, styles, and images use `/PLUGIN_NAME/`. Vite's
default build output remains `dist/`.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/PLUGIN_NAME/',
  plugins: [react()],
});
```

Replace `PLUGIN_NAME` with the exact repository name, then verify that `npm run build` creates
`dist/index.html`.

Use `base: '/'` instead when the plugin is served from the domain root: an `OWNER.github.io`
user or organization site, or a custom domain deployed at its root. For example:

```ts
export default defineConfig({
  base: '/',
  plugins: [react()],
});
```

### Add the GitHub Actions workflow

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy plugin to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm run typecheck --if-present
      - run: npm test --if-present
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Enable and verify GitHub Pages

The GitHub CLI can ask GitHub to use the Actions workflow:

```bash
gh api --method POST repos/OWNER/PLUGIN_NAME/pages -f build_type=workflow
```

This command needs permission to administer Pages for the repository. If GitHub refuses it, open
**Settings → Pages** in the repository and select **GitHub Actions** under **Build and deployment
→ Source**. GitHub documents both the [Pages API](https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#create-a-github-pages-site)
and the [web settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

After pushing, find and watch the workflow:

```bash
gh run list --workflow deploy-pages.yml --limit 1
gh run watch RUN_ID --exit-status
```

Replace `RUN_ID` with the value shown by the first command. Open the deployed address and confirm
that it loads over HTTPS without a sign-in prompt. Put that exact address in `plugin.json`, commit
and push the manifest change, and wait for the deployment again before creating a release.

## Create a release

OWOX Data Marts reads versions from GitHub Releases. A release becomes eligible when it is:

- published rather than saved as a draft;
- not marked as a GitHub prerelease;
- tagged exactly `MAJOR.MINOR.PATCH`, optionally with a leading `v`;
- attached to a resolvable commit with a valid root `plugin.json`;
- configured with a public, embeddable delivery page.

After the deployment succeeds, create the first production release:

```bash
gh release create v0.1.0 --target main --generate-notes
```

To use GitHub's web interface instead, open **Releases**, select **Draft a new release**, create
the tag `v0.1.0` from `main`, describe the change, leave **Set as a pre-release** unchecked, and
select **Publish release**. See [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).

Prerelease identifiers such as `v1.2.3-rc.1` and build metadata such as `v1.2.3+build.7` are not
eligible, even though both are valid SemVer. Use GitHub's prerelease checkbox for test releases.

The highest eligible version becomes current for everyone using the plugin, and members cannot
pin an older version.

## Publish and install

Publishing makes a plugin findable but installs it for nobody. Every member decides whether to
install it, and unpublishing later does not uninstall existing installations.

### Publish in OWOX Data Marts

1. Open **Plugins** in OWOX Data Marts.
2. Select **Publish Plugin**.
3. Enter `OWNER/PLUGIN_NAME` in **GitHub repository**.
4. Under **Who can find it**, choose **Only me** for testing. A Project Admin can choose
   **Everyone in this project** after the plugin is ready.
5. Publish the plugin, find it in the Gallery, select it, and confirm installation.

For an agent or script, use the already configured [`owox-ctl`](../api/owox-ctl.md):

```bash
# Publish only for yourself while testing.
owox-ctl plugins publish OWNER/PLUGIN_NAME --scope member

# Publish for everyone in the project. Requires Project Admin access.
owox-ctl plugins publish OWNER/PLUGIN_NAME --scope project

# Deployment administrators can publish to selected projects.
owox-ctl plugins publish OWNER/PLUGIN_NAME --scope deployment --project-id PROJECT_ID

# Deployment administrators can publish to every current and future project.
owox-ctl plugins publish OWNER/PLUGIN_NAME --scope deployment --all-projects
```

Member publication is the recommended first step for authors. Deployment scope is restricted to
deployment administrators using API keys named in `OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS`;
it also requires either one or more `--project-id` choices or `--all-projects`. Use selected
project IDs when possible: `--all-projects` makes the plugin findable in every current and future
project, and projects cannot be excluded from that audience.

A public repository needs no GitHub App setup. For a private repository, publish once and follow
the installation link returned by OWOX Data Marts to grant the correct GitHub App access, then
publish again. A self-managed deployment may use its own GitHub App, so use the link returned by
that deployment.

## Test the installed plugin

Publish the first release to **Only me**, install it, and test it inside OWOX Data Marts. The
frontend depends on the host iframe and the real `@owox/plugin-sdk` handshake, so a standalone
local frontend is not a supported preview environment.

Exercise the key flows with the installing member's real access. Confirm loading, empty, error,
and success states; light and dark themes; narrow and wide layouts; navigation; and every
`ctx.owox` call the plugin uses. Fix issues, deploy the corrected files, and create a higher
eligible release before sharing the plugin more broadly.

## Update or roll back

For a normal update, change and test the plugin, deploy it, and create a higher production release
such as `v0.1.1`. OWOX Data Marts checks relevant repositories daily. Ask for an immediate check
when needed:

```bash
owox-ctl plugins update OWNER/PLUGIN_NAME
```

A valid higher release applies to every installation. There is no member-level version pinning.
To roll back, restore the last working source, deploy it, and create a new higher patch release
that explains the restoration; do not try to move or recreate an older tag.

OWOX Data Marts records the exact commit referenced by each eligible release, but the delivery URL
does not pin the files served there. Once an eligible release version is recorded, moving,
deleting, or recreating its tag cannot rewrite that recorded version; use a new higher eligible
release to roll back. Deploying different files changes what installed members run even before
another release is created. Treat every deployment to the production URL as a production change
and keep its release metadata aligned.

## Troubleshoot

If the plugin cannot be published or opens as a blank page, verify that:

- `npm run build` succeeds and creates `dist/index.html`;
- the GitHub Actions workflow uploads `dist`;
- Vite's `base` exactly matches the deployed path: `/PLUGIN_NAME/` for a project site, or `/` for
  a user or organization site or custom-domain root deployment;
- the Pages deployment succeeds and the HTTPS address opens without signing in;
- `plugin.json` is at the repository root and contains that exact delivery address;
- the GitHub Release is published, is not a prerelease, and has an eligible version tag;
- scripts, fonts, and fetched assets are served with `Access-Control-Allow-Origin: *`;
- the entry page is not blocked by `X-Frame-Options` or `frame-ancestors`;
- the OWOX Data Marts GitHub App can read the repository when it is private;
- the plugin catches errors and shows a useful message instead of a blank screen.

An administrator can suspend a plugin across a deployment. A suspended plugin cannot be opened,
installed, or restored, but existing installations are not removed. Resuming makes it available
again on the current version.

## Definition of done

Before sharing the plugin with a project, confirm that:

- the repository contains `AGENTS.md`, source files, `plugin.json`, and the Pages workflow;
- build, lint, type checking, and tests pass;
- the installed personal test in OWOX Data Marts covers narrow and wide layouts, light and dark
  themes, and understandable loading, empty, error, and success states;
- no credential or `.env` file is committed;
- the deployed page and all its assets load from a public HTTPS address;
- the production release points to the intended commit and has an eligible version tag;
- the plugin has been published to **Only me**, installed, and tested with the installing member's
  real access, including every `ctx.owox` call it uses;
- the plugin description matches what the plugin actually does;
- project-wide publication happens only after the personal installation passes.

## Reference links

- [GitHub CLI](https://cli.github.com/)
- [`@owox/plugin-sdk` package guide](../../packages/plugin-sdk/README.md)
- [TypeScript/JavaScript API client](../api/api-client.md)
- [API Support Matrix](../api/coverage.md)
- [owox-ctl](../api/owox-ctl.md)
- [Vite deployment guide](https://vite.dev/guide/static-deploy.html)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages API](https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#create-a-github-pages-site)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
