import { Router } from 'express';
import { AUTH_PAGE_ROUTES, AUTH_API_ROUTES, API_ROUTES } from '@owox/idp-protocol';
import { BetterAuthProvider } from '../providers/better-auth-provider.js';
import { BetterAuthPageHandlers } from './auth-pages.js';
import { BetterAuthApiHandlers } from './auth-api.js';
import { BetterAuthManagementHandlers } from './management-api.js';

/**
 * Create Express router with all Better Auth routes
 */
export function createBetterAuthRouter(provider: BetterAuthProvider): Router {
  const router = Router();

  // Initialize handlers
  const pageHandlers = new BetterAuthPageHandlers(provider);
  const apiHandlers = new BetterAuthApiHandlers(provider);
  const managementHandlers = new BetterAuthManagementHandlers(provider);

  router.get(AUTH_PAGE_ROUTES.SIGN_IN, pageHandlers.signInPage);
  router.get(AUTH_PAGE_ROUTES.SIGN_OUT, pageHandlers.signOutPage);
  router.get(AUTH_PAGE_ROUTES.SIGN_UP, pageHandlers.signUpPage);
  router.get(AUTH_PAGE_ROUTES.MAGIC_LINK, pageHandlers.magicLinkPage);
  router.get(AUTH_PAGE_ROUTES.MAGIC_LINK_VERIFY, pageHandlers.magicLinkVerifyPage);
  router.get(AUTH_PAGE_ROUTES.GOOGLE_CALLBACK, pageHandlers.googleCallbackPage);
  router.get(AUTH_PAGE_ROUTES.MICROSOFT_CALLBACK, pageHandlers.microsoftCallbackPage);
  router.post(AUTH_API_ROUTES.REFRESH, apiHandlers.refreshToken);
  router.post(AUTH_API_ROUTES.REVOKE, apiHandlers.revokeToken);
  router.post(AUTH_API_ROUTES.INTROSPECT, apiHandlers.introspectToken);
  router.get(API_ROUTES.USERS, managementHandlers.getUsers);
  router.post(API_ROUTES.USERS, managementHandlers.createUser);
  router.get(API_ROUTES.USER_BY_ID, managementHandlers.getUser);
  router.put(API_ROUTES.USER_BY_ID, managementHandlers.updateUser);
  router.delete(API_ROUTES.USER_BY_ID, managementHandlers.deleteUser);
  router.get(API_ROUTES.HEALTH, managementHandlers.healthCheck);

  // Authentication API Routes (POST)
  router.post(AUTH_API_ROUTES.REFRESH, apiHandlers.refreshToken);
  router.post(AUTH_API_ROUTES.REVOKE, apiHandlers.revokeToken);
  router.post(AUTH_API_ROUTES.INTROSPECT, apiHandlers.introspectToken);

  // Management API Routes
  router.get(API_ROUTES.USERS, managementHandlers.getUsers);
  router.post(API_ROUTES.USERS, managementHandlers.createUser);
  router.get(API_ROUTES.USER_BY_ID, managementHandlers.getUser);
  router.put(API_ROUTES.USER_BY_ID, managementHandlers.updateUser);
  router.delete(API_ROUTES.USER_BY_ID, managementHandlers.deleteUser);
  router.get(API_ROUTES.HEALTH, managementHandlers.healthCheck);

  return router;
}

/**
 * Create a minimal router with only essential endpoints
 */
export function createMinimalBetterAuthRouter(provider: BetterAuthProvider): Router {
  const router = Router();

  const pageHandlers = new BetterAuthPageHandlers(provider);
  const apiHandlers = new BetterAuthApiHandlers(provider);
  const managementHandlers = new BetterAuthManagementHandlers(provider);

  // Essential endpoints only
  router.get('/auth/sign-in', pageHandlers.signInPage);
  router.get('/auth/sign-out', pageHandlers.signOutPage);
  router.post('/auth/api/introspect', apiHandlers.introspectToken);
  router.get('/api/health', managementHandlers.healthCheck);

  return router;
}

/**
 * Middleware to add Better Auth routes to existing Express app
 */
export function addBetterAuthRoutes(app: any, provider: BetterAuthProvider) {
  const router = createBetterAuthRouter(provider);
  app.use('/', router);

  return app;
}
