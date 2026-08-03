# Building an OWOX plugin

A plugin is a web app you host yourself. OWOX learns about it from a GitHub repository,
lists it in a Gallery, and embeds it in a sandboxed iframe for members who install it.

## Read this part first

Six constraints cause almost every "why doesn't my plugin work" question. They follow
from the sandbox, not from policy, so no OWOX setting relaxes them.

**Your page runs in an opaque origin.** No cookies, no `localStorage`, no `sessionStorage`,
no `IndexedDB`, no service workers. Anything you keep between sessions has to live on your
own backend, keyed by something you receive from OWOX.

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
permit OWOX — `*`, `https:`, or your OWOX deployment's exact origin. OWOX checks this at
publication time and refuses a page it could never display.

**Your entry page must announce itself.** Serve a descriptor beside it, or publication is
refused with `SDK_HANDSHAKE_FAILED`:

```jsonc
// https://plugin.example.com/.well-known/owox-plugin.json
{ "sdk": "owox-plugin-sdk", "sdkVersion": "1" }
```

It is resolved relative to your delivery URL, not to your domain apex, so shared hosting
works. Static JSON with `Access-Control-Allow-Origin: *` is enough. OWOX reads it before
any browser has loaded your page, which is why the real in-frame handshake cannot stand in
for it: `sdkVersion` is how a deployment knows it can host you at all.

**You never hold a credential.** `ctx.owox` calls are brokered by the OWOX host page,
which attaches the token. Your requests act with the authority of the member who installed
your plugin — never more, and never on behalf of anyone else.

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

OWOX reads your GitHub releases. A release becomes a version when it is:

- published, not a draft;
- not marked as a GitHub prerelease;
- tagged exactly `MAJOR.MINOR.PATCH`, optionally with a leading `v`;
- pointing at a resolvable commit that has a valid `plugin.json` at its root;
- delivering an embeddable page that serves `/.well-known/owox-plugin.json`.

### Tagging, and one narrowing worth knowing

Prerelease identifiers (`v1.2.3-rc.1`) and build metadata (`v1.2.3+build.7`) are refused,
**even though both are valid SemVer 2.0.0.**

The reason is what versions do here: the highest eligible version becomes current
immediately, for everyone who has the plugin installed, and nobody can pin an older one.
A release candidate reaching production is therefore a hazard rather than a feature. Build
metadata is worse — SemVer requires it to be ignored when ordering versions, so `1.2.3`
and `1.2.3+build` could not be told apart at all.

Ship release candidates on releases marked as GitHub prereleases. OWOX ignores those
entirely, so you can cut as many as you like.

### What OWOX does and does not pin

OWOX records the exact commit your release pointed at, and that record never changes:
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
running inside an OWOX frame, and if no host answers within 10 seconds.

|                                                          |                                                                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.owox`                                               | OWOX API client. The SDK owns its transport; you cannot replace or inspect it.                                                                                   |
| `ctx.openExternal(url)`                                  | Ask the host to open an external https URL in a new tab. The sandbox denies you both navigation and popups, so the host opens it, not you.                       |
| `ctx.navigate(path)`                                     | Ask the host to go to a page inside OWOX — `/ui/${ctx.projectId}/data-marts/${id}` — in place of your frame. Anything resolving off the app's origin is refused. |
| `ctx.setHeight(px)`                                      | Report content height so the host can size your frame.                                                                                                           |
| `ctx.signal`                                             | Aborts when the host tears your plugin down.                                                                                                                     |
| `ctx.member`, `ctx.projectId`, `ctx.theme`, `ctx.locale` | Display context. No tokens.                                                                                                                                      |

Requests time out after 30 seconds. Streamed reads do not, because data traversals
legitimately run for minutes. At most 32 requests may be in flight at once.

## Publishing

Any project member can publish a plugin for themselves, and a Project Admin can publish it
to their whole project — both from the OWOX web app. Publishing to an entire deployment is
done with `owox-ctl` by an allowlisted publisher key:

```bash
owox-ctl plugins publish OWOX/example-plugin --scope deployment --all-projects
owox-ctl plugins publish OWOX/example-plugin --scope deployment --project-id p1 --project-id p2
```

Publishing only makes a plugin **findable**. It installs it for nobody: every member still
installs it for themselves, and unpublishing later does not uninstall anyone.

If OWOX cannot read your repository, it answers with a link to install the OWOX GitHub App
on it. Grant access and run the same command again.

## What members are told about you

At install time a member sees your GitHub owner name, a link to it, and — for a public
repository — a link to the repository itself. A private repository discloses the owner
only.

They are also told plainly that your plugin acts with their access, that anything it reads
can leave OWOX, and that reinstalling restores nothing your plugin kept on its own side.
Design accordingly: a member who feels misled about that is a member who uninstalls.

## When something goes wrong

An administrator can suspend a plugin across the whole deployment. While suspended it
cannot be opened, installed or restored — but nobody's installation is removed, and
resuming brings it back on whatever version is current by then.
