# Publishing Guide for @owox/backend

This guide explains how to publish the OWOX Data Marts Backend package to npm.

## Prerequisites

1. **NPM Account**: Ensure you have access to the `@owox` organization on npm
2. **Authentication**: Login to npm with `npm login`

## Publishing Process

### 1. Pre-publishing Checklist

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Security audit passes: `npm audit`
- [ ] No sensitive data in the package

### 2. Publishing

```bash
# Simple publish command
npm publish
```

The publishing process automatically:
- Runs the `prepack` script (which builds the package)
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

- `dist/**/*.js` - Compiled JavaScript files (no source maps or TypeScript declarations)
- `dist/**/*.json` - Configuration files
- `dist/**/*.html` - HTML files (web application)
- `dist/**/*.css` - Stylesheets
- `dist/**/*.png`, `dist/**/*.ico`, `dist/**/*.svg` - Static assets
- `package.json` - Package metadata and dependencies

## Troubleshooting

## Security

- Never commit API keys or sensitive configuration
- Use environment variables for configuration
- Security audit runs automatically during `prepublishOnly` script
- Consider using `npm audit fix` before publishing if vulnerabilities are found
