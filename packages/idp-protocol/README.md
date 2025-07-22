# @owox/idp-protocol

Identity Provider protocol abstraction for OWOX Data Marts. This package provides a common interface for implementing various IdP solutions (Logto, Better Auth, etc).

## Features

- 🔐 JWT-based authentication with custom key management
- 🔑 Magic link authentication support
- 👥 Multi-project user management
- 🛡️ Role-based access control (RBAC)
- 🎯 Fine-grained permissions system
- 🔄 Token refresh mechanism
- 🚀 Express middleware & standard API routes
- 📊 TypeORM entities for database
- 🗄️ Database agnostic

## Installation

```bash
npm install @owox/idp-protocol
```

## Core Concepts

### Protocol Architecture

The protocol acts as an abstraction layer between your application and specific IdP implementations:

```text
Application Layer
    ↓
idp-protocol (this package)
    ↓
Implementation Layer (idp-logto, idp-better-auth)
    ↓
IdP Provider (Logto, Better Auth)
```

### Key Components

1. **IIdpProvider Interface** - Main contract that all IdP implementations must follow
2. **BaseIdpProvider** - Abstract class with common functionality
3. **Token Management** - JWT signing/verification with custom keys
4. **Express Middleware** - Ready-to-use Express authentication middleware
5. **Standard API Routes** - Predefined endpoints for consistent IdP implementation

## Usage

### Basic Implementation

```typescript
import { BaseIdpProvider, IdpConfig } from '@owox/idp-protocol';

class MyIdpProvider extends BaseIdpProvider {
  // Implement abstract methods
  async createUser(data: CreateUserDto): Promise<User> {
    // Implementation
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    // Implementation
  }

  // ... other abstract methods
}

// Initialize
const idpProvider = new MyIdpProvider({
  issuer: 'owox-idp',
  audience: 'owox-app',
  accessTokenTTL: 900, // 15 minutes
  refreshTokenTTL: 604800, // 7 days
  magicLinkTTL: 3600, // 1 hour
});
```

### Express Middleware

```typescript
import { createAuthMiddleware, requireRole } from '@owox/idp-protocol';

const app = express();

// Apply auth middleware
app.use('/api', createAuthMiddleware(idpProvider));

// Protect routes with roles
app.get('/api/admin', requireRole('admin'), (req, res) => {
  res.json({ user: req.user });
});

// Optional auth
app.get('/api/public', createAuthMiddleware(idpProvider, { optional: true }), (req, res) => {
  res.json({ authenticated: !!req.user });
});
```

### Standard API Routes

The protocol defines standard API endpoints that all IdP implementations should provide:

```typescript
import { AUTH_PAGE_ROUTES, AUTH_API_ROUTES, API_ROUTES, buildRoute } from '@owox/idp-protocol';

// Authentication page routes (for user-facing pages)
console.log(AUTH_PAGE_ROUTES.SIGN_IN);     // '/auth/sign-in'
console.log(AUTH_PAGE_ROUTES.SIGN_OUT);    // '/auth/sign-out'
console.log(AUTH_PAGE_ROUTES.MAGIC_LINK);  // '/auth/magic-link'

// Authentication API routes (for programmatic access)
console.log(AUTH_API_ROUTES.REFRESH);      // '/auth/api/refresh'
console.log(AUTH_API_ROUTES.INTROSPECT);   // '/auth/api/introspect'

// Management API routes
console.log(API_ROUTES.USERS);             // '/api/users'
console.log(API_ROUTES.USER_BY_ID);        // '/api/users/:id'
console.log(API_ROUTES.HEALTH);            // '/api/health'

// Build routes with parameters
const userRoute = buildRoute('https://api.example.com', API_ROUTES.USER_BY_ID, { id: '123' });
// Result: 'https://api.example.com/api/users/123'
```

### Route Handlers with TypeScript

```typescript
import { 
  SignInPageRequest,
  RefreshTokenApiRequest,
  RefreshTokenApiResponse,
  HealthCheckRequest,
  HealthCheckResponse,
  AuthPageHandler,
  AuthApiHandler,
  ApiHandler
} from '@owox/idp-protocol';

// Sign in page handler (GET)
const signInPage: AuthPageHandler<SignInPageRequest> = 
  async (req, res) => {
    // Render sign-in HTML page
    res.render('auth/sign-in');
  };

// Token refresh API handler (POST)  
const refreshTokenApi: AuthApiHandler<RefreshTokenApiRequest, RefreshTokenApiResponse> =
  async (req, res) => {
    const { refreshToken } = req.body;
    
    try {
      const tokens = await idpProvider.refreshToken(refreshToken);
      res.json({ success: true, data: tokens });
    } catch (error) {
      res.status(401).json({ success: false, error: error.message });
    }
  };

// Health check handler  
const healthCheck: ApiHandler<HealthCheckRequest, HealthCheckResponse> =
  async (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  };
```

### Magic Link Flow

```typescript
// Create magic link
const magicLink = await idpProvider.createMagicLink('user@example.com', 'project-id');

// Send magicLink.url via email

// Verify magic link
const authResult = await idpProvider.verifyMagicLink(token);
// Returns { user, tokens, isNewUser }
```

### Token Management

```typescript
// Sign in
const result = await idpProvider.signIn({
  email: 'user@example.com',
  password: 'password123',
});

// Refresh tokens
const newTokens = await idpProvider.refreshToken(result.tokens.refreshToken);

// Verify access token
const payload = await idpProvider.verifyAccessToken(accessToken);
```

### TypeORM Configuration

```typescript
import { getDatabaseConfig } from '@owox/idp-protocol/config';
import { DataSource } from 'typeorm';

const dataSource = new DataSource(getDatabaseConfig());
```

## Database Schema

Database is fully agnostic, you can use any database you want.

Run the SQL schema from `src/schema/idp-schema.sql` or use TypeORM migrations:

```typescript
import { User, Project, Role, Permission } from '@owox/idp-protocol/entities';

// Use with TypeORM
const dataSource = new DataSource({
  type: 'sqlite', // or 'mysql', 'postgres'
  database: './idp.db',
  entities: [User, Project, Role, Permission, ...],
});
```

### Entity IDs

Database-specific primary keys are used for each entity.

## Token Structure

Access tokens contain:

```typescript
{
  sub: string;        // User ID
  email: string;
  roles: string[];
  permissions?: string[];
  projectId: string;
  iat: number;
  exp: number;
  iss: string;        // Issuer
  aud: string;        // Audience
}
```

## Standard API Endpoints

### Authentication Pages Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/sign-in` | GET | Page to sign in with email/password |
| `/auth/sign-out` | GET | Page to sign out current user |
| `/auth/sign-up` | GET | Page to register new user |
| `/auth/magic-link` | GET | Page to send magic link to email |
| `/auth/magic-link/verify` | GET | Page to verify magic link token |
| `/auth/google/callback` | GET | OAuth callback with Google |
| `/auth/microsoft/callback` | GET | OAuth callback with Microsoft |
| `/auth/verify-email` | GET | Page to verify email address |
| `/auth/verify-email/resend` | POST | Page to resend email verification |
| `/auth/password-reset` | GET | Page to request password reset |
| `/auth/password-reset/verify` | GET | Page to verify password reset token |
| `/auth/password-change` | GET | Page to change user password |

### Authentication API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/api/refresh` | POST | Refresh access token |
| `/auth/api/revoke` | POST | Revoke refresh token |
| `/auth/api/introspect` | POST | Introspect token validity |

### Management API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET, POST | List users or create new user |
| `/api/users/:id` | GET, PUT, DELETE | Get, update, or delete user |
| `/api/users/profile` | GET, PUT | Get or update current user profile |
| `/api/projects` | GET, POST | List projects or create new project |
| `/api/projects/:id` | GET, PUT, DELETE | Get, update, or delete project |
| `/api/projects/:id/users` | GET, POST, DELETE | Manage project users |
| `/api/roles` | GET, POST | List or create roles |
| `/api/permissions` | GET, POST | List or create permissions |
| `/api/users/:id/roles` | GET, PUT | Get or update user roles |
| `/api/users/:id/permissions` | GET, PUT | Get or update user permissions |
| `/api/tokens` | GET, DELETE | List or revoke tokens |
| `/api/sessions` | GET, DELETE | List or revoke sessions |
| `/api/health` | GET | Health check endpoint |
| `/api/status` | GET | Service status |
| `/api/version` | GET | API version info |

### Optional Endpoints & Capabilities

Not all IDP implementations need to support every endpoint. Use capabilities to declare what your provider supports:

```typescript
import { BaseIdpProvider, IdpCapabilities } from '@owox/idp-protocol';

// Define what your IDP supports
const capabilities: Partial<IdpCapabilities> = {
  authPages: {
    signIn: true,
    signOut: true,
    signUp: false, // Don't support registration
    magicLink: true,
    socialAuth: {
      google: true,
      microsoft: false,
    },
  },
  authApi: {
    tokenRefresh: true,
    tokenIntrospection: true,
    tokenRevoke: false, // Don't support token revocation
  },
  managementApi: {
    users: {
      read: true,
      list: true,
      create: false, // Read-only users
    },
    health: true,
  },
};

class MyIdpProvider extends BaseIdpProvider {
  constructor(config: IdpConfig) {
    super(config, capabilities);
  }
}

// Check capabilities at runtime
const provider = new MyIdpProvider(config);
console.log(provider.hasCapability('authPages.magicLink')); // true
console.log(provider.hasCapability('managementApi.users.create')); // false

// Get list of supported endpoints
import { getSupportedEndpoints } from '@owox/idp-protocol';
const endpoints = getSupportedEndpoints(provider.getCapabilities());
```

### Implementation Notes

- **Flexible Implementation**: Only implement the endpoints your IDP actually supports
- **Capability Declaration**: Use `IdpCapabilities` to declare what features are available
- **Runtime Validation**: Check capabilities before routing to endpoints
- **Consistent Standards**: All implemented endpoints follow the same patterns
- **TypeScript Safety**: Full type safety for all request/response interfaces
