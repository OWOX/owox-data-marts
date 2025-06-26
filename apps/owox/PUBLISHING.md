# Publishing Guide for owox CLI

This guide explains how to publish the OWOX Data Marts CLI package to npm.

## Prerequisites

1. **NPM Account**: Ensure you have access to publish to npm
2. **Authentication**: Login to npm with `npm login`

## Publishing Process

### 1. Pre-publishing Checklist

- [ ] No sensitive data in the package
- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Security audit passes: `npm audit`
- [ ] CLI builds successfully: `npm run build`
- [ ] OCLIF manifest is up to date: `oclif manifest`

### 2. Publishing

```bash
# Simple publish command
npm publish
```

The publishing process automatically:

- Runs the `prepack` script (which generates OCLIF manifest)
- Runs the `prepublishOnly` script (which runs security audit, tests and linting)
- Publishes the package

### 3. Manual Publishing (if needed)

```bash
# Check what will be published (builds automatically)
npm pack --dry-run

# Publish (builds automatically)
npm publish
```

## Package Contents

The published package contains only the production-necessary files:

- `bin/**/*.js` - CLI executable files
- `bin/**/*.cmd` - Windows CLI executable files
- `dist/**/*.js` - Compiled JavaScript files
- `dist/**/*.d.ts` - TypeScript declaration files
- `oclif.manifest.json` - OCLIF command manifest
- `package.json` - Package metadata and dependencies

## Troubleshooting

## Security

- Never commit API keys or sensitive configuration
- Use environment variables for configuration
- Security audit runs automatically during `prepublishOnly` script
- Consider using `npm audit fix` before publishing if vulnerabilities are found
