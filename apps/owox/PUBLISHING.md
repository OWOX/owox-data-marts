# Publishing Guide for OWOX CLI

This guide explains the automated publishing process for the OWOX Data Marts CLI package to npm.

## Overview

The `owox` CLI package is published automatically through GitHub Actions. For detailed information about the release strategy, versioning, installation commands, security guidelines, and troubleshooting, see the [Release & Versioning Strategy](../../docs/release-strategy.md).

## Automated Publishing Process

The publishing process automatically:

- Runs the `prepack` script (which generates OCLIF manifest)
- Runs the `prepublishOnly` script (which runs security audit, tests and linting)
- Publishes the package to the appropriate npm tag

## Package Contents

The published package contains only the production-necessary files:

- `bin/**/*.js` - CLI executable files
- `bin/**/*.cmd` - Windows CLI executable files
- `dist/**/*.js` - Compiled JavaScript files
- `oclif.manifest.json` - OCLIF command manifest
- `package.json` - Package metadata and dependencies

To preview what will be published before the automated process runs:

```bash
npm pack --dry-run
```

This command will show you exactly which files will be included in the published package.
