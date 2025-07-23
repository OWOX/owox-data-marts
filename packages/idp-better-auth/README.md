# @owox/idp-better-auth

Better Auth implementation for the OWOX IDP Protocol.

## Features

- ✅ SQLite and MySQL database support
- ✅ Email/password authentication
- ✅ Magic link authentication
- ✅ Social authentication (Google, GitHub)
- ✅ Session management
- ✅ TypeScript support
- ✅ Express integration with standard API routes
- ✅ Configurable capabilities and optional endpoints

## Installation

```bash
npm install @owox/idp-better-auth @owox/idp-protocol
```

### Database Dependencies

Choose your database and install the corresponding driver:

**SQLite (recommended for development):**

```bash
npm install better-sqlite3
```

**MySQL:**

```bash
npm install mysql2
```

## Quick Start

### SQLite Configuration

```typescript
import { createSqliteProvider } from '@owox/idp-better-auth';

// Using the example configuration
const provider = await createSqliteProvider();

// Or create custom configuration
import { BetterAuthProvider } from '@owox/idp-better-auth';

const provider = await BetterAuthProvider.create(
  // IDP Protocol config
  {
    magicLinkTTL: 3600,
    magicLinkBaseUrl: 'http://localhost:3000',
    defaultProjectId: 'default',
    requireEmailVerification: true,
  },
  // Better Auth config
  {
    database: {
      type: 'sqlite',
      filename: './database.sqlite',
    },
    secret: 'your-secret-key',
    baseURL: 'http://localhost:3000',
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    magicLink: {
      enabled: true,
      sendMagicLink: async ({ email, url, token }) => {
        // Implement your email sending logic here
        console.log(`Send magic link to ${email}: ${url}?token=${token}`);
      },
    },
  }
);
```

### MySQL Configuration

```typescript
import { createMysqlProvider } from '@owox/idp-better-auth';

// Using the example configuration
const provider = await createMysqlProvider();

// Or create custom configuration
const provider = await BetterAuthProvider.create(
  // IDP Protocol config
  {
    magicLinkTTL: 3600,
    magicLinkBaseUrl: 'http://localhost:3000',
    defaultProjectId: 'default',
    requireEmailVerification: true,
  },
  // Better Auth config
  {
    database: {
      type: 'mysql',
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: 'better_auth',
      port: 3306,
    },
    secret: 'your-secret-key',
    baseURL: 'http://localhost:3000',
    emailAndPassword: {
      enabled: true,
    },
  }
);
```

## Magic Link Authentication

This implementation uses Better Auth's native magic link plugin for simplified authentication:

```typescript
// Magic links are sent automatically when enabled
const provider = await BetterAuthProvider.create(idpConfig, {
  magicLink: {
    enabled: true,
    sendMagicLink: async ({ email, url, token }) => {
      // Your email sending implementation
      await sendEmail({
        to: email,
        subject: 'Sign in to your account',
        body: `Click here to sign in: ${url}?token=${token}`,
      });
    },
    expiresIn: 300, // 5 minutes (optional)
    disableSignUp: false, // Allow new user registration (optional)
  },
});

// Send a magic link
await provider.createMagicLink('user@example.com', 'project-id');
```

The magic link plugin automatically handles:

- Token generation and validation
- Link expiration
- User verification
- Session creation upon successful verification

## Database Schema

Better Auth automatically manages the database schema. To generate and run migrations:

```bash
# Install Better Auth CLI
npm install -g @better-auth/cli

# Generate schema
npx @better-auth/cli@latest generate

# Run migrations
npx @better-auth/cli@latest migrate
```

## Express Integration

### Basic Usage with Standard Routes

```typescript
import express from 'express';
import { createSqliteProvider, createBetterAuthRouter } from '@owox/idp-better-auth';

const app = express();
const provider = await createSqliteProvider();

// Add all Better Auth routes automatically
const authRouter = createBetterAuthRouter(provider);
app.use('/', authRouter);

app.listen(3000);
```

### Available Endpoints

The provider automatically creates these standard endpoints:

**Authentication Pages (GET):**

- `/auth/sign-in` - Sign in page
- `/auth/sign-out` - Sign out page  
- `/auth/sign-up` - Sign up page
- `/auth/magic-link` - Magic link request page
- `/auth/google/callback` - Google OAuth callback

**Authentication API (POST):**

- `/auth/api/refresh` - Refresh access token
- `/auth/api/revoke` - Revoke token
- `/auth/api/introspect` - Token introspection

**Management API:**

- `/api/users` - User CRUD operations
- `/api/health` - Health check endpoint

### Custom Protected Routes

```typescript
app.get('/protected/profile', async (req, res) => {
  const token = req.cookies['better-auth.session_token'] || 
                req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const user = await provider.introspectToken(token);
    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});
```

## Configuration Options

### Database Configuration

```typescript
// SQLite
{
  database: {
    type: 'sqlite',
    filename: './database.sqlite'
  }
}

// MySQL
{
  database: {
    type: 'mysql',
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'better_auth',
    port: 3306
  }
}

// Custom adapter
{
  database: {
    type: 'custom',
    adapter: yourCustomAdapter
  }
}
```

### Authentication Methods

```typescript
{
  // Email/password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendEmailVerification: async (email, url, token) => {
      // Your email sending logic
    }
  },
  
  // Magic link authentication (uses Better Auth native plugin)
  magicLink: {
    enabled: true,
    sendMagicLink: async ({ email, url, token }) => {
      // Your magic link sending logic (e.g., email service)
      console.log(`Send magic link to ${email}: ${url}?token=${token}`);
    },
    expiresIn: 300, // 5 minutes (optional)
    disableSignUp: false, // Allow signup via magic link (optional)
  },
  
  // Social providers
  socialProviders: {
    google: {
      clientId: 'your-google-client-id',
      clientSecret: 'your-google-client-secret'
    },
    github: {
      clientId: 'your-github-client-id',
      clientSecret: 'your-github-client-secret'
    }
  }
}
```

## Environment Variables

Copy `src/config/example.env` to `.env` and configure:

```env
# Required
BETTER_AUTH_SECRET=your-super-secret-key-min-32-chars-long

# Optional
APP_URL=http://localhost:3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password
DB_NAME=better_auth
```

## API

### BetterAuthProvider

The main provider class that implements the IDP protocol:

```typescript
import { BetterAuthProvider } from '@owox/idp-better-auth';

const provider = await BetterAuthProvider.create(idpConfig, betterAuthConfig);

// Use with any IDP protocol method
await provider.signIn({ email: 'user@example.com', password: 'password' });
await provider.introspectToken('jwt-token');
```

### Database Adapters

Low-level database adapter functions:

```typescript
import { 
  createDatabaseAdapter, 
  createSqliteAdapter, 
  createMysqlAdapter 
} from '@owox/idp-better-auth';

// Auto-detect and create appropriate adapter
const adapter = createDatabaseAdapter(databaseConfig);

// Create specific adapters
const sqlite = createSqliteAdapter({ type: 'sqlite', filename: 'db.sqlite' });
const mysql = createMysqlAdapter({ type: 'mysql', host: 'localhost', ... });
```

## License

ELv2
