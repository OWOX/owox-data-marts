# @owox/idp-better-auth

Better Auth implementation for OWOX IDP Protocol with real authentication flows.

## Installation

```bash
npm install @owox/idp-better-auth better-auth drizzle-orm
```

## Features

✅ **Real Better Auth Integration**

- Email/password authentication
- OAuth providers (Google, Microsoft)
- Session management
- User CRUD operations
- Express.js and NestJS support

⚠️ **Limitations**

- Magic links handled through Better Auth flows
- Some methods require direct database access
- Token refresh handled automatically by Better Auth

## Usage

### Basic Setup

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { BetterAuthProvider } from '@owox/idp-better-auth';

// Setup database
const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

// Create provider
const provider = new BetterAuthProvider(
  {
    issuer: 'your-app',
    audience: 'your-audience',
    defaultProjectId: 'default',
  },
  {
    database: db,
    secret: process.env.AUTH_SECRET!,
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendEmailVerification: async (email, url, token) => {
        // Send verification email
        console.log(`Verification link: ${url}?token=${token}`);
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      },
    },
  }
);
```

### Express.js Integration

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';
import {
  createBetterAuthMiddleware,
  createAuthenticationMiddleware,
  requireEmailVerification,
  extractUserFromSession
} from '@owox/idp-better-auth';

const app = express();

app.use(express.json());
app.use(cookieParser());

// Add Better Auth routes (handles /api/auth/*)
app.use('/api/auth/*', createBetterAuthMiddleware(provider));

// Optional: Extract user info on all routes
app.use(extractUserFromSession(provider));

// Protect specific routes
app.use('/api/protected', createAuthenticationMiddleware(provider));

// Require email verification for sensitive operations
app.use('/api/admin', requireEmailVerification());

app.get('/api/protected/profile', (req, res) => {
  res.json({ user: req.user, session: req.session });
});
```

### NestJS Integration

```typescript
import { Module } from '@nestjs/common';
import { BetterAuthModule } from '@owox/idp-better-auth';

@Module({
  imports: [
    BetterAuthModule.forRoot({
      idpConfig: {
        issuer: 'your-app',
        audience: 'your-audience',
        defaultProjectId: 'default',
      },
      betterAuthConfig: {
        database: db,
        secret: process.env.AUTH_SECRET!,
        // ... other Better Auth options
      },
    }),
  ],
})
export class AppModule {}

// In your controller
import { Injectable } from '@nestjs/common';
import { BetterAuthService } from '@owox/idp-better-auth';

@Injectable()
export class AuthController {
  constructor(private authService: BetterAuthService) {}

  async signIn(credentials: SignInCredentials) {
    return this.authService.signIn(credentials);
  }
}
```

### Authentication Methods

#### Email/Password Sign In

```typescript
const result = await provider.signIn({
  email: 'user@example.com',
  password: 'secure-password',
});

console.log(result.user);     // User info
console.log(result.tokens);   // Access tokens
console.log(result.isNewUser); // Whether user was just created
```

#### User Management

```typescript
// Create user
const user = await provider.createUser({
  email: 'new-user@example.com',
  password: 'secure-password',
  name: 'John Doe',
});

// Update user (limited fields)
const updatedUser = await provider.updateUser(user.id, {
  name: 'Jane Doe',
});

// Note: getUser and getUserByEmail have limitations in Better Auth
// They require direct database access or session-based approaches
```

#### OAuth Integration

```typescript
// Get OAuth redirect URL
const oauthUrl = provider.getOAuthUrl('google', 'http://localhost:3000/callback');

// Redirect user to oauthUrl
// Better Auth handles the OAuth flow automatically
```

#### Session Management

```typescript
// Verify session token
const payload = await provider.verifyAccessToken(sessionToken);

// Get current session
const session = await provider.getCurrentSession(sessionToken);

// Sign out
await provider.signOut(userId);
```

## Configuration

### BetterAuthConfig

| Option | Type | Description |
|--------|------|-------------|
| `database` | `DrizzleDB` | Drizzle database instance |
| `secret` | `string` | Secret key for signing sessions |
| `baseURL` | `string` | Base URL of your application |
| `emailAndPassword` | `object` | Email/password authentication config |
| `socialProviders` | `object` | OAuth provider configurations |
| `session` | `object` | Session configuration |
| `trustedOrigins` | `string[]` | Trusted origins for CORS |

### Environment Variables

```env
DATABASE_URL=sqlite://./data/better-auth.db
AUTH_SECRET=your-super-secret-key-at-least-32-chars
BASE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
```

## Database Setup

Better Auth requires database tables. Create them using Better Auth's migration system:

```typescript
import { betterAuth } from 'better-auth';

const auth = betterAuth({
  database: db,
  // ... other config
});

// Run migrations (in development)
await auth.api.migrate();
```

## Frontend Integration

Better Auth provides client-side SDKs:

```typescript
import { createAuthClient } from 'better-auth/client';

const client = createAuthClient({
  baseURL: 'http://localhost:3000',
});

// Sign up
await client.signUp.email({
  email: 'user@example.com',
  password: 'password',
  name: 'User Name',
});

// Sign in
await client.signIn.email({
  email: 'user@example.com',
  password: 'password',
});

// OAuth sign in
await client.signIn.social({
  provider: 'google',
});
```
