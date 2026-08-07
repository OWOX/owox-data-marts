# Prepare your plugin project

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
```

## Ready to build

Before you begin, confirm that you have:

- authenticated `gh`
- authenticated `owox-ctl`
- an empty local repository
- a root `AGENTS.md`

Continue to the [plugin authoring guide](./authoring-guide.md).
