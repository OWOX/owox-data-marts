# `@owox/prettier-config`

Shared Prettier configuration for the OWOX Data Marts workspace.

## Usage

### Base Configuration

For basic JavaScript/TypeScript projects:

```js
// prettier.config.js
import { config } from '@owox/prettier-config/base';

export default config;
```

### TypeScript Projects

For TypeScript projects with enhanced configuration:

```js
// prettier.config.js
import { config } from '@owox/prettier-config/typescript';

export default config;
```

### Web/React Projects

For React projects with TailwindCSS support:

```js
// prettier.config.js
import { config } from '@owox/prettier-config/web';

export default config;
```

## Configurations

- **base**: Core formatting rules for all projects
- **typescript**: TypeScript-specific rules and file type handling
- **web**: React/TailwindCSS-specific rules with class sorting

## Features

- Consistent formatting across the monorepo
- TypeScript support with proper parsing
- TailwindCSS class sorting for web projects
- Markdown and JSON formatting
- ESM exports for modern tooling
