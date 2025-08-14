# @owox/idp-protocol

Identity Provider protocol package for OWOX Data Marts. Provides core types, middleware, and provider implementations for authentication and authorization.

## Features

- 🔧 Core IDP interfaces and types
- 🔀 Express middleware for authentication routes
- 🚫 NULL IDP provider for single-user deployments
- 🛡️ Built-in error handling
- ⚙️ Configurable routing

## Installation

```bash
npm install @owox/idp-protocol
```

## Architecture

```text
@owox/idp-protocol
├── types/                    # Core interfaces and models
│   ├── provider.ts          # IdpProvider interface  
│   ├── models.ts            # Payload, AuthResult, Role types
│   ├── config.ts            # Configuration types
│   ├── errors.ts            # Error classes
│   └── cli.ts               # CLI command interfaces
├── providers/               # Provider implementations
│   └── null-provider.ts     # NULL provider for development
└── middleware/              # Express middleware
    └── protocol-middleware.ts # Route handling middleware
```

## Core Types

### IdpProvider Interface

The main provider interface that all IDP implementations must follow:

```typescript
import { IdpProvider } from '@owox/idp-protocol';

interface IdpProvider {
  // Middleware handlers
  signInMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;
  signOutMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;
  accessTokenMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;

  // Token management
  introspectToken(token: string): Promise<Payload | null>;
  refreshToken(refreshToken: string): Promise<AuthResult>;
  revokeToken(token: string): Promise<void>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

### Domain Models

```typescript
import { Payload, AuthResult, Role } from '@owox/idp-protocol';

type Role = 'admin' | 'editor' | 'viewer';

interface Payload {
  userId: string;
  projectId: string;
  email?: string;
  fullName?: string;
  roles?: Role[];
  projectTitle?: string;
}

interface AuthResult {
  accessToken: string;
  refreshToken?: string;
}
```

### Error Classes

```typescript
import {
  IdpError,
  AuthenticationError,
  AuthorizationError,
  TokenExpiredError,
  InvalidTokenError,
} from '@owox/idp-protocol';
```

## Middleware

The protocol middleware handles authentication routes automatically:

```typescript
import express from 'express';
import { IdpProtocolMiddleware, NullIdpProvider } from '@owox/idp-protocol';

const app = express();
const provider = new NullIdpProvider();

// Basic usage with default routes (/auth/sign-in, /auth/sign-out, /auth/access-token)
const middleware = new IdpProtocolMiddleware(provider);
middleware.register(app);

// Custom configuration
const middleware = new IdpProtocolMiddleware(provider, {
  basePath: '/api/v1/auth',
  routes: {
    signIn: '/login',
    signOut: '/logout',
    accessToken: '/token'
  }
});
middleware.register(app);
```

### Middleware Features

- ✅ Configurable base path and route names
- ✅ Automatic error handling with try-catch
- ✅ Support for all HTTP methods (GET, POST, etc.)
- ✅ Route collision detection
- ✅ Path validation
- ✅ TypeScript support

## NULL Provider

The included NULL provider is perfect for development and single-user deployments:

```typescript
import { NullIdpProvider } from '@owox/idp-protocol';

const provider = new NullIdpProvider();

// Default user payload
const defaultPayload = {
  userId: '0',
  email: 'admin@localhost', 
  roles: ['admin'],
  fullName: 'Admin',
  projectId: '0',
};
```

### NULL Provider Features

- ✅ Implements all IdpProvider methods
- 🔄 Returns consistent default user payload
- 🚫 No actual authentication (always succeeds)  
- ⚡ Zero configuration required
- 🛠️ Perfect for testing and development

## Usage Examples

### Basic Setup

```typescript
import express from 'express';
import { IdpProtocolMiddleware, NullIdpProvider } from '@owox/idp-protocol';

const app = express();
const provider = new NullIdpProvider();

// Initialize provider
await provider.initialize();

// Setup middleware
const middleware = new IdpProtocolMiddleware(provider);
middleware.register(app);

// Server will handle:
// POST /auth/sign-in
// POST /auth/sign-out  
// POST /auth/access-token

app.listen(3000);
```

### Custom Provider Implementation

```typescript
import { IdpProvider, Payload, AuthResult } from '@owox/idp-protocol';
import { Request, Response, NextFunction } from 'express';

class CustomIdpProvider implements IdpProvider {
  async signInMiddleware(req: Request, res: Response, next: NextFunction): Promise<Response> {
    // Handle OAuth redirect, validate credentials, etc.
    return res.json({ success: true, redirectUrl: '/dashboard' });
  }

  async signOutMiddleware(req: Request, res: Response, next: NextFunction): Promise<Response> {
    // Clear session, revoke tokens
    return res.json({ success: true });
  }

  async accessTokenMiddleware(req: Request, res: Response, next: NextFunction): Promise<Response> {
    // Return user info or token
    const payload = await this.introspectToken(req.headers.authorization);
    return res.json(payload);
  }

  async introspectToken(token: string): Promise<Payload | null> {
    // Validate JWT or call external IDP
    return {
      userId: 'user123',
      projectId: 'proj456', 
      email: 'user@company.com',
      roles: ['editor']
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    // Exchange refresh token for new access token
    return { accessToken: 'new-jwt-token' };
  }

  async revokeToken(token: string): Promise<void> {
    // Invalidate token
  }

  async initialize(): Promise<void> {
    // Setup external connections, validate config
  }

  async shutdown(): Promise<void> {
    // Cleanup resources
  }
}
```

### Advanced Middleware Configuration

```typescript
import { IdpProtocolMiddleware, ProtocolRoute } from '@owox/idp-protocol';

const middleware = new IdpProtocolMiddleware(provider, {
  basePath: '/api/v1/auth',
  routes: {
    signIn: ProtocolRoute.SIGN_IN,      // '/sign-in'
    signOut: ProtocolRoute.SIGN_OUT,    // '/sign-out'  
    accessToken: '/me'                  // Custom route
  }
});

// Results in:
// ALL /api/v1/auth/sign-in
// ALL /api/v1/auth/sign-out
// ALL /api/v1/auth/me
```

## Error Handling

Use provided error classes for consistent error handling:

```typescript
import { AuthenticationError, InvalidTokenError } from '@owox/idp-protocol';

class MyProvider implements IdpProvider {
  async introspectToken(token: string): Promise<Payload | null> {
    if (!token) {
      throw new InvalidTokenError('Token is required');
    }

    try {
      // Validate token
      return payload;
    } catch (error) {
      throw new AuthenticationError('Token validation failed');
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```
