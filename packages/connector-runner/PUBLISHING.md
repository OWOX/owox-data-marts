# Publishing

This guide explains the automated publishing process for the OWOX Data Marts Connector Runner package to npm.

## Overview

The `@owox/connector-runner` package is published automatically through GitHub Actions. For detailed information about the release strategy, versioning, installation commands, security guidelines, and troubleshooting, see the [Release & Versioning Strategy](../../docs/contributing/repository/release-strategy.md).

## Automated Publishing Process

The publishing process automatically:

- Runs the `prepublishOnly` script (which runs security audit, tests and linting)
- Publishes the package to the appropriate npm tag

## Package Contents

The published package contains only the production-necessary files:

- `src/**/*.js` - Source JavaScript files
- `package.json` - Package metadata and dependencies

To preview what will be published before the automated process runs:

```bash
npm pack --dry-run
```

This command will show you exactly which files will be included in the published package.
