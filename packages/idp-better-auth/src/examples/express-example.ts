/**
 * Example Express server with Better Auth routes
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { createSqliteProvider } from './sqlite-config.js';
import { createBetterAuthRouter, addBetterAuthRoutes } from '../routes/express-router.js';
import { getSupportedEndpoints } from '@owox/idp-protocol';
import { getMigrations } from 'better-auth/db';

/**
 * Create Express app with Better Auth routes
 */
export async function createExpressApp() {
  const app = express();

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Create Better Auth provider
  console.log('Creating Better Auth provider');
  const provider = await createSqliteProvider();

  const betterAuth = provider.getBetterAuth();
  console.log('Getting migrations');
  console.log(JSON.stringify(betterAuth.options, null, 2));
  const { toBeCreated, toBeAdded, runMigrations, compileMigrations } = await getMigrations(
    betterAuth.options
  );
  console.log(toBeCreated);
  console.log(toBeAdded);
  console.log(runMigrations);
  console.log(compileMigrations);
  await runMigrations();
  await compileMigrations();

  // Method 1: Use the complete router
  const authRouter = createBetterAuthRouter(provider);
  app.use('/', authRouter);

  // Method 2: Alternative - add routes directly to app
  // addBetterAuthRoutes(app, provider);

  // Add custom routes
  app.get('/', (req, res) => {
    res.json({
      message: 'Better Auth IDP Server',
      capabilities: provider.getCapabilities(),
      endpoints: getSupportedEndpoints(provider.getCapabilities()),
    });
  });

  // Protected route example
  app.get('/protected', async (req, res) => {
    const sessionToken =
      req.cookies?.['better-auth.session_token'] ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const tokenPayload = await provider.introspectToken(sessionToken);
      res.json({
        message: 'Protected resource',
        user: tokenPayload,
      });
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  return app;
}

/**
 * Start the server
 */
export async function startServer(port = 3000) {
  const app = await createExpressApp();

  app.listen(port, () => {
    console.log(`Better Auth IDP Server running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log(`Sign in page: http://localhost:${port}/auth/sign-in`);
  });

  return app;
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(console.error);
}
