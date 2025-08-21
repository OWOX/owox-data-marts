# Web Static Assets Utility

This utility provides functionality to configure Express applications to serve static web interface files from the `@owox/web` package.

## Features

- **Automatic package discovery**: Automatically finds web packages and their built assets
- **Configurable package source**: Supports custom package names (default: `@owox/web`)
- **SPA routing support**: Configures fallback routing for Single Page Applications
- **Configurable excluded routes**: Allows customization of routes that should not trigger SPA fallback
- **Optimized caching**: Sets up proper HTTP headers for static file caching
- **Graceful degradation**: Continues to work even if web assets are not available
- **Single package per Express app**: Designed for one UI package per Express application instance

## Usage

### Basic Usage

```typescript
import express from 'express';
import { setupWebStaticAssets } from './web/index.js';

const app = express();

// Configure static assets with default settings
const success = setupWebStaticAssets(app);

if (success) {
  console.log('Web interface is available');
} else {
  console.log('Web interface not available - continuing with API only');
}
```

### Advanced Usage

```typescript
import express from 'express';
import { setupWebStaticAssets, StaticAssetsOptions } from './web/index.js';

const app = express();

// Configure with custom package and excluded routes
const options: StaticAssetsOptions = {
  packageName: '@custom/ui-package',
  excludedRoutes: ['/api', '/health', '/metrics', '/docs'],
};

const success = setupWebStaticAssets(app, options);

if (success) {
  console.log('Custom UI package configured successfully');
} else {
  console.log('Custom UI package not found, using API-only mode');
}
```

## API

### `setupWebStaticAssets(app, options?)`

Configures Express application to serve static web interface files.

**Parameters:**

- `app: Express` - Express application instance
- `options?: StaticAssetsOptions` - Configuration options (optional)

**Returns:** `boolean` - `true` if static assets were successfully configured, `false` if static files not found

### `StaticAssetsOptions`

Configuration options for static assets setup.

**Properties:**

- `excludedRoutes?: string[]` - Array of route prefixes that should not trigger SPA fallback (default: `['/api']`)
- `packageName?: string` - Name of the package containing static assets (default: `'@owox/web'`)

## How it works

1. **Package Discovery**: Uses `require.resolve()` to find the specified web package (default: `@owox/web`)
2. **Static Files**: Serves files from the `dist` directory with optimized caching headers
3. **SPA Fallback**: Configures middleware to serve `index.html` for non-API routes without file extensions
4. **Route Exclusion**: Skips SPA fallback for configured excluded routes (API endpoints, health checks, etc.)

## Testing

The utility includes comprehensive tests covering:

- Basic functionality
- Custom configuration options
- Error handling
- Express integration

Run tests with:

```bash
npm test -- --grep "setupWebStaticAssets"
```
