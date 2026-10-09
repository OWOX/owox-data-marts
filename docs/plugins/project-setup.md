# Get Started

## Give this page to your coding agent

Copy this prompt into a new coding-agent task:

```text
Help me prepare an OWOX Data Marts plugin project.

Follow this page with me:
https://docs.owox.com/docs/plugins/project-setup/

Guide me through the prerequisites, command-line tools, repository creation, and AGENTS.md setup.
Stop when the repository is ready to build, and report any step that needs me to authenticate or
make a choice.
```

## Before you begin

You need an OWOX Data Marts project, a GitHub account, Node.js and npm, and a coding agent.

## Set up the GitHub CLI

Install the [GitHub CLI](https://cli.github.com/) and check whether it is already authenticated:

```bash
gh auth status
```

If needed, start sign-in:

```bash
gh auth login
```

Complete authentication in your own terminal or browser. Do not paste GitHub tokens or OWOX API
keys into the coding-agent task or prompt, `AGENTS.md`, or repository. For the full policy, see
[Security and trust model](./authoring-guide.md#security-and-trust-model).

## Set up owox-ctl

Read about [owox-ctl](../api/owox-ctl.md) and [API keys](../api/api-keys.md), then install and
authenticate the CLI:

```bash
npm install -g @owox/ctl
owox-ctl --help
export OWOX_API_KEY=owox_key_xxx
owox-ctl status
```

Complete authentication in your own terminal or browser. Do not paste GitHub tokens or OWOX API
keys into the coding-agent task or prompt, `AGENTS.md`, or repository. For the full policy, see
[Security and trust model](./authoring-guide.md#security-and-trust-model).

## Create and clone the repository

Create and clone the repository with:

```bash
gh repo create OWNER/PLUGIN_NAME --public --clone
cd PLUGIN_NAME
git branch -M main
```

This keeps the later Pages workflow and release commands consistent by naming the branch `main`.

As a fallback, use GitHub's **New repository** flow, then clone it with its HTTPS URL. Public
repositories are recommended for the simplest free Pages path. Pages from a private repository
requires an eligible paid plan, and the deployed page must remain public.

## Save the agent instructions

Save the following as the root `AGENTS.md` file:

```md
# OWOX Data Marts plugin development

Before changing this plugin, read:
https://docs.owox.com/docs/plugins/authoring-guide/

Use the OWOX Data Marts plugin authoring guide as the source of truth for plugin behavior,
security constraints, manifests, SDK usage, deployment, releases, and publishing.

If the authoring guide cannot be accessed, report that limitation before making assumptions
about the OWOX plugin contract.

## Hosting

- The plugin is a static Vite build. The GitHub Actions workflow deploys `dist` to GitHub Pages.
- Vite `base` matches the deployed path: `/PLUGIN_NAME/` for a project site, `/` for a domain
  root.
- `delivery.url` in `plugin.json` is the public HTTPS address of the deployed page.
- Every deployment to that address changes what installed members run, even before a release.
  Treat it as a production change.

## Versions and releases

- A version is a published GitHub Release that is not a draft or a prerelease, tagged
  `MAJOR.MINOR.PATCH` with an optional leading `v` and no prerelease or build suffix. OWOX
  records the tagged commit and its `plugin.json`.
- The highest eligible release becomes current for every member. Moving or recreating a tag does
  not change a recorded version; roll back with a new, higher release.
- Within a compatibility line, a release cannot remove a collection or change its name, scope, or
  entity binding. Below 1.0.0 the line is the minor version, from 1.0.0 the major version; bump
  it to ship such a change.
- After a release, `owox-ctl plugins update OWNER/PLUGIN_NAME` applies it without waiting for the
  daily check.

## Errors

- Catch errors from every `ctx.owox`, collection, and credential call, and show the member what
  failed. Never leave a blank screen.
- The reason is in `error.payload` (`code`, `status`, `message`, `details`), or in
  `error.cause.payload` when the API client wrapped it. See "Handle request errors" in the
  authoring guide.
```

## Ready to build

Before you begin, confirm that you have:

- authenticated `gh`
- authenticated `owox-ctl`
- an empty local repository
- a root `AGENTS.md`

Continue to the [plugin authoring guide](./authoring-guide.md).
