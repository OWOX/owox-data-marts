# Building an OWOX Data Marts plugin

A plugin is a web page OWOX Data Marts embeds in a sandboxed iframe and runs with the
authority of the member who installed it. That is the contract, and everything below
follows from it: the sandbox decides what your page may do, and the installing member
decides what your requests may reach.

How the page gets there is a separate matter. Today you host it yourself, and OWOX Data
Marts learns about it from a GitHub repository — which is why publishing takes a
repository, and why your page must be reachable over https and embeddable from the public
internet.

## Read this part first

Five constraints cause almost every "why doesn't my plugin work" question. They follow
from the sandbox, not from policy, so no setting in OWOX Data Marts relaxes them.

**Your page runs in an opaque origin.** No cookies, no `localStorage`, no `sessionStorage`,
no `IndexedDB`, no service workers. Anything you keep between sessions has to live on your
own backend, keyed by something you receive from OWOX Data Marts.

**Calls to your own backend arrive with `Origin: null`.** Your backend must answer
`Access-Control-Allow-Origin: *`, and it cannot authenticate them with cookies. If it
needs to know who is calling, pass an identifier explicitly.

**Your own assets are cross-origin to your own page.** An opaque origin matches nothing,
including the host that served the page, so anything fetched in CORS mode needs
`Access-Control-Allow-Origin: *` from your own server too — `<script type="module">`,
fonts, and every `fetch` your page makes. This is the one that looks like nothing is
wrong: the page loads, the browser blocks the module script, and the plugin sits there
having run no code at all. GitHub Pages sends the header already; a plain static server
usually does not. A page with an inline script and no assets never meets this.

**Your entry page must be embeddable.** It must not send `X-Frame-Options`, and if it
sends a `Content-Security-Policy` with a `frame-ancestors` directive, that directive must
permit OWOX Data Marts — `*`, `https:`, or your deployment's exact origin. This is checked
at publication time, and a page that could never be displayed is refused.

**You never hold a credential.** `ctx.owox` calls are brokered by the OWOX Data Marts host page,
which attaches the token. Your requests act with the authority of the member who installed
your plugin — never more, and never on behalf of anyone else. Protected routes still apply
their server-side authorization and reject calls that member may not make.

## The manifest

A `plugin.json` at the repository root:

```json
{
  "name": "Example Plugin",
  "description": "What this plugin does",
  "delivery": {
    "type": "remote",
    "url": "https://plugin.example.com"
  }
}
```

There is no `id` and no `version` in it. Identity comes from the GitHub repository, and
the version comes from the release tag — so renaming or transferring your repository does
not create a second plugin, and two repositories with identical contents are two plugins.

The delivery URL must be HTTPS, must be reachable, and must not resolve into a private or
metadata network, including through redirects.

## Releasing a version

OWOX Data Marts reads your GitHub releases. A release becomes a version when it is:

- published, not a draft;
- not marked as a GitHub prerelease;
- tagged exactly `MAJOR.MINOR.PATCH`, optionally with a leading `v`;
- pointing at a resolvable commit that has a valid `plugin.json` at its root;
- delivering an embeddable page.

### Tagging, and one narrowing worth knowing

Prerelease identifiers (`v1.2.3-rc.1`) and build metadata (`v1.2.3+build.7`) are refused,
**even though both are valid SemVer 2.0.0.**

The reason is what versions do here: the highest eligible version becomes current
immediately, for everyone who has the plugin installed, and nobody can pin an older one.
A release candidate reaching production is therefore a hazard rather than a feature. Build
metadata is worse — SemVer requires it to be ignored when ordering versions, so `1.2.3`
and `1.2.3+build` could not be told apart at all.

Ship release candidates on releases marked as GitHub prereleases. OWOX Data Marts ignores those
entirely, so you can cut as many as you like.

### What OWOX Data Marts does and does not pin

OWOX Data Marts records the exact commit your release pointed at, and that record never changes:
moving, deleting or recreating a tag cannot rewrite a version that already exists.

It records your delivery URL but **does not pin what that URL serves**. You can change
your deployed code at any time without cutting a release. That is deliberate, and it means
the trust members place in you is continuous, not per-version.

## Using the SDK

```bash
npm install @owox/plugin-sdk
```

```ts
import { connect } from '@owox/plugin-sdk';

const ctx = await connect();
const dataMarts = await ctx.owox.dataMarts.list();
```

`connect()` completes a handshake with the host page. It rejects if your page is not
running inside an OWOX Data Marts frame, and if no host answers within 10 seconds.

|                                            |                                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.owox`                                 | OWOX Data Marts API client. The SDK owns its transport; you cannot replace or inspect it.                                                                                   |
| `ctx.ui.openExternal(url)`                 | Ask the host to open an external https URL in a new tab. The sandbox denies you both navigation and popups, so the host opens it, not you.                                  |
| `ctx.ui.navigate(path)`                    | Ask the host to go to a page inside OWOX Data Marts — `/ui/${ctx.projectId}/data-marts/${id}` — in place of your frame. Anything resolving off the app's origin is refused. |
| `ctx.signal`                               | Aborts when the host tears your plugin down.                                                                                                                                |
| `ctx.userId`, `ctx.projectId`, `ctx.theme` | Display context. No tokens. Your member's name and avatar come from `ctx.owox.auth` when you need them.                                                                     |

Requests time out after 30 seconds. Streamed reads do not, because data traversals
legitimately run for minutes. At most 32 requests may be in flight at once.

### Low-level API escape hatch

Prefer the typed `ctx.owox` resources. For an endpoint that has no typed abstraction, the client
also exposes `getJson<T>(path, query?)`, `postJson<T>(path, body, accept?)`, `putJson<T>(path,
body)`, `patchJson<T>(path, body)`, `deleteJson<T = void>(path)`, and `getStream(path, query?)`.
The generic does not validate the response at runtime, so validate returned data yourself. Paths
must be root-relative `/api/...` and are limited to 2,048 characters; unsafe or redirecting paths
are refused.

`ctx.owox` remains brokered through the host and never exposes runtime credentials. PATCH and
DELETE extend the existing protocol additively, so existing plugins remain compatible.

```ts
type Deleted = { deleted: true };

await ctx.owox.patchJson('/api/example-resource/item-123', { title: 'Updated title' });
const deleted = await ctx.owox.deleteJson<Deleted>('/api/example-resource/item-123');
await ctx.owox.deleteJson('/api/example-resource/item-123'); // Empty or 204 response: void
```

## Publishing

Publishing to yourself is how you try your own plugin: any project member may do it, and
nobody else sees the listing. A Project Admin can publish to their whole project the same
way. Both work from the OWOX Data Marts web app and from `owox-ctl`:

```bash
# for yourself, which is how you try a build
owox-ctl plugins publish OWOX/example-plugin --scope member

# a Project Admin, for everyone in the project
owox-ctl plugins publish OWOX/example-plugin --scope project
```

There is a third level, `--scope deployment`, which lists a plugin for every project at
once. It is an administrator's operation rather than an author's, and it is restricted to
API keys named in `OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS` — so unless you run the
deployment, the two scopes above are the ones you have.

Publishing only makes a plugin **findable**. It installs it for nobody: every member still
installs it for themselves, and unpublishing later does not uninstall anyone.

A public repository needs no setup — releases and metadata are read anonymously. A private
one has to grant access to the
[OWOX Data Marts GitHub App](https://github.com/apps/owox-data-marts), and publishing
answers with an installation link if it cannot read your repository yet. Grant access and
run the same command again.

That link is the one to follow: a self-managed deployment may register its own GitHub App,
so the URL the error gives you points at whichever App that deployment actually uses.

## What members are told about you

At install time a member sees your GitHub owner name, a link to it, and — for a public
repository — a link to the repository itself. A private repository discloses the owner
only.

They are also told plainly that your plugin acts with their access, that anything it reads
can leave OWOX Data Marts, and that reinstalling restores nothing your plugin kept on its own side.
Design accordingly: a member who feels misled about that is a member who uninstalls.

## When something goes wrong

An administrator can suspend a plugin across the whole deployment. While suspended it
cannot be opened, installed or restored — but nobody's installation is removed, and
resuming brings it back on whatever version is current by then.
