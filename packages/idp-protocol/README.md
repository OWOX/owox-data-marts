# @owox/idp-protocol

Identity Provider protocol abstraction for OWOX Data Marts. This package provides a common interface for implementing various IdP solutions (Logto, Better Auth, etc).

## Features

- 🔐 JWT-based authentication with custom key management
- 🔑 Magic link authentication support
- 👥 Multi-project user management
- 🛡️ Role-based access control (RBAC)
- 🎯 Fine-grained permissions system
- 🔄 Token refresh mechanism
- 🚀 Express & NestJS middleware/guards
- 📊 TypeORM entities for database
- 🗄️ Multi-database support (PostgreSQL, MySQL, SQLite)

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
4. **Middleware/Guards** - Ready-to-use Express and NestJS authentication

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

### NestJS Integration

```typescript
import { AuthModule, AuthGuard, Roles, CurrentUser } from '@owox/idp-protocol';

@Module({
  imports: [
    AuthModule.forRoot({
      idpProvider: myIdpProvider,
      useGlobalGuards: true,
    }),
  ],
})
export class AppModule {}

@Controller('users')
export class UsersController {
  @Get('profile')
  getProfile(@CurrentUser() user: TokenPayload) {
    return user;
  }

  @Post('admin-action')
  @Roles('admin')
  adminAction() {
    return { success: true };
  }
}
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

## Database Support

The protocol supports multiple databases out of the box:

### SQLite (Default)

Perfect for development and single-instance deployments:

```bash
DB_TYPE=sqlite
SQLITE_DATABASE=./data/idp.db
```

### MySQL

For production deployments requiring a robust RDBMS:

```bash
DB_TYPE=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=owox_idp
```

### PostgreSQL

For advanced features and enterprise deployments:

```bash
DB_TYPE=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DATABASE=owox_idp
```

### Database Initialization

Initialize your database with the appropriate schema:

```bash
# SQLite (default)
owox idp init

# MySQL
owox idp init --type mysql --host localhost --username root --password pass --database owox_idp

# PostgreSQL
owox idp init --type postgres --host localhost --username postgres --password pass --database owox_idp

# With options
owox idp init --type sqlite --database ./myapp.db --drop-existing --seed
```

### TypeORM Configuration

```typescript
import { getDatabaseConfig } from '@owox/idp-protocol/config';
import { DataSource } from 'typeorm';

const dataSource = new DataSource(getDatabaseConfig());
```

## Database Schema

Run the SQL schema from `src/schema/[database-type].sql` or use TypeORM migrations:

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

All entities use UUID v4 strings as primary keys for cross-database compatibility:

- PostgreSQL: native UUID type
- MySQL: CHAR(36)
- SQLite: TEXT

The `BaseEntity` automatically generates UUIDs on insert.

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

## Security Considerations

1. **Key Management**
   - Private keys should be encrypted at rest
   - Implement key rotation regularly
   - Use different keys per environment

2. **Token Security**
   - Short-lived access tokens (15 min default)
   - Secure refresh token storage
   - HTTPS-only in production

3. **Magic Links**
   - Single-use tokens
   - Short expiration time
   - Rate limiting on creation

## CLI Commands Support

The protocol supports these CLI operations:

```bash
# Initialize IdP (to be implemented in owox CLI)
owox idp init

# Add user with magic link
owox idp add-user user@example.com

# Rotate signing keys
owox idp rotate-keys
```

## Error Handling

```typescript
import { IdpError, AuthenticationError, TokenExpiredError } from '@owox/idp-protocol';

try {
  await idpProvider.verifyAccessToken(token);
} catch (error) {
  if (error instanceof TokenExpiredError) {
    // Handle expired token
  } else if (error instanceof AuthenticationError) {
    // Handle auth failure
  }
}
```

## Contributing

1. Follow the abstract methods in `BaseIdpProvider`
2. Implement all required database operations
3. Add tests for your implementation
4. Ensure TypeScript types are properly exported
