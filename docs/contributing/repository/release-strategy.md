# Release & Versioning Strategy

## Overview

This repository follows a structured release strategy with the following principles:

- **Long-term API stability**: Avoid breaking changes for OSS and Cloud
- **Major bumps = marketing**: 2.0.0, 3.0.0 used sparingly; not necessarily breaking
- **Patch digit always 0**: All normal changes use **minor** bumps (`x.y.0`) to minimize maintenance burden (postpone patch version complexity for as long as possible)
- **Publishable packages** (`owox`, `@owox/backend`, `@owox/connectors`, and `@owox/connector-runner`) always share **identical versions**.

## Version & Distribution Tags

| Naming   | Version Example              | npm tag | Audience                 |
|----------|------------------------------|---------|--------------------------|
| Stable   | `0.7.0`, `1.8.0`             | `latest`| Community                |
| Snapshot | `0.5.0-next-20250630211639`  | `next`  | Cloud deploy, Power Users|

## Installation Commands

| Need             | Command                                          |
| ---------------- | ------------------------------------------------ |
| Stable (newest)  | `npm install -g owox`                            |
| Stable (exact)   | `npm install -g owox@1.8.0`                      |
| Snapshot (newest)| `npm install -g owox@next`                       |
| Snapshot (exact) | `npm install -g owox@0.5.0-next-20250630211639`  |

## Contributor Workflow

### 1. Making Changes

```bash
# Make your changes
# Create a changeset
npx changeset

# Choose the appropriate bump type:
# - major: for breaking changes (use sparingly)
# - minor: for new features, improvements (recommended)
# - patch: not used in this strategy

# Add everything and commit
git add .
git commit -m "feat: your feature description"
git push
```

### 2. Automated Process

On every push to `main`:

1. **Snapshot Build** (`publish.yml`): Automatically publishes a snapshot version to the `next` tag for testing and early access
2. **Version PR** (`release-pr.yml`): Changesets bot creates/updates a "Version Packages" PR that collects all pending changesets
3. **Stable Release** (`publish.yml`): When the "Version Packages" PR is merged, the workflow publishes the new stable version to the `latest` tag

## Security

- Never commit API keys or sensitive configuration
- Use environment variables for configuration
- Security audit runs automatically during the publishing process
- Vulnerabilities are automatically detected and reported

## Troubleshooting

If you encounter issues with the automated publishing:

1. Check the GitHub Actions workflow runs in the repository
2. Verify that all tests and linting pass locally
3. Contact the maintainers if the automated process fails
