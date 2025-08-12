# @owox/idp-protocol

Identity Provider protocol package for OWOX Data Marts. Contains only core types and a NULL provider implementation.

## Features

- 🔧 Core IDP interfaces and types
- 🚫 NULL IDP provider for single-user deployments
- 📦 TypeScript support

## Installation

```bash
npm install @owox/idp-protocol
```

## Architecture

This package provides the essential building blocks for IDP integration:

```text
@owox/idp-protocol
├── types/           # Core interfaces
│   ├── provider.ts  # IIdpProvider interface
│   ├── models.ts    # User, Project, TokenPayload
│   ├── config.ts    # IdpConfig interface
│   └── errors.ts    # Error classes
└── providers/
    └── null-provider.ts  # NULL implementation
```

## Core Types

### IIdpProvider Interface

The main provider interface that all IDP implementations must follow:

```typescript
import { IIdpProvider } from '@owox/idp-protocol';

interface IIdpProvider {
  // Authentication
  getAuthUrl(redirectUri: string): string;
  handleCallback(redirectUri: string, code: string): Promise<AuthResult>;
  signIn(redirectUri: string): Promise<AuthResult>;

  // Token management
  verifyToken(token: string): Promise<TokenPayload | null>;
  refreshToken(refreshToken: string): Promise<AuthResult>;
  revokeToken(token: string): Promise<void>;

  // User/project info
  getUserInfo(token: string): Promise<User>;
  getProjectInfo(token: string): Promise<Project>;
  getUserProjects(token: string): Promise<Project[]>;

  // Lifecycle
  initialize(app: Express): Promise<void>;
  shutdown(): Promise<void>;
}
```

### Domain Models

```typescript
import { User, Project, TokenPayload } from '@owox/idp-protocol';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface Project {
  id: string;
  name: string;
}

interface TokenPayload {
  sub: string; // user id
  email: string;
  name?: string;
  roles: string[];
  projectId: string;
  iat: number;
  exp: number;
  iss: string; // issuer
  aud: string; // audience
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

## NULL Provider

The included NULL provider is perfect for development and single-user deployments:

```typescript
import { NullIdpProvider } from '@owox/idp-protocol';

const provider = new NullIdpProvider();

// Default user and project
const user = provider.getDefaultUser();
// { id: '0', email: 'user@localhost', name: 'Default User' }

const project = provider.getDefaultProject();
// { id: '0', name: 'Default Project' }
```

### NULL Provider Features

- ✅ Implements all IIdpProvider methods
- 🔄 Returns consistent default user/project
- 🚫 No actual authentication (always succeeds)
- ⚡ Zero configuration required
- 🛠️ Perfect for testing and development

## Usage Examples

### Basic Provider Usage

```typescript
import { NullIdpProvider } from '@owox/idp-protocol';

const provider = new NullIdpProvider();
await provider.initialize(app);

// Get auth URL (returns empty string for NULL)
const authUrl = provider.getAuthUrl('http://localhost:3000/callback');

// Sign in (always succeeds)
const result = await provider.signIn('http://localhost:3000/callback');
console.log(result.accessToken); // Empty string

// Verify token (always returns default payload)
const payload = await provider.verifyToken('any-token');
console.log(payload.email); // 'user@localhost'
```

### Custom Provider Implementation

```typescript
import { IIdpProvider, AuthResult, User, Project } from '@owox/idp-protocol';

class CustomIdpProvider implements IIdpProvider {
  async initialize(app: Express): Promise<void> {
    // Setup routes, connect to external IDP
  }

  getAuthUrl(redirectUri: string): string {
    return `https://my-idp.com/auth?redirect=${redirectUri}`;
  }

  async handleCallback(redirectUri: string, code: string): Promise<AuthResult> {
    // Exchange code for tokens
    return {
      accessToken: 'jwt-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    };
  }

  // Implement other methods...
}
```

### Command Interfaces

Optional interfaces for user management commands:

```typescript
import {
  IdpProviderAddUserCommand,
  IdpProviderListUsersCommand,
  IdpProviderRemoveUserCommand,
} from '@owox/idp-protocol';

class AdminIdpProvider implements IIdpProvider, IdpProviderAddUserCommand {
  async addUser(username: string, password?: string): Promise<AddUserCommandResponse> {
    // Add user to IDP
    return { username, magicLink: 'https://...' };
  }
}
```

## TypeScript Support

All types are fully typed with strict TypeScript support:

```typescript
// Import specific types
import type { IIdpProvider, AuthResult, TokenPayload, IdpConfig } from '@owox/idp-protocol';

// Type-safe provider creation
function createProvider(config: IdpConfig): IIdpProvider {
  // Implementation
}
```

## Error Handling

Use provided error classes for consistent error handling:

```typescript
import { AuthenticationError, InvalidTokenError } from '@owox/idp-protocol';

try {
  const payload = await provider.verifyToken(token);
} catch (error) {
  if (error instanceof InvalidTokenError) {
    // Handle invalid token
  } else if (error instanceof AuthenticationError) {
    // Handle auth failure
  }
}
```
