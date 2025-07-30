/**
 * Standard API routes for IDP management and administration
 */

// Management API Routes
export const API_ROUTES = {
  // User management
  USERS: '/api/users',
  USER_BY_ID: '/api/users/:id',
  USER_PROFILE: '/api/users/profile',

  // Project management
  PROJECTS: '/api/projects',
  PROJECT_BY_ID: '/api/projects/:id',
  PROJECT_USERS: '/api/projects/:id/users',

  // Role and permission management
  ROLES: '/api/roles',
  PERMISSIONS: '/api/permissions',
  USER_ROLES: '/api/users/:id/roles',
  USER_PERMISSIONS: '/api/users/:id/permissions',

  // Token and session management
  TOKENS: '/api/tokens',
  TOKEN_BY_ID: '/api/tokens/:id',
  ACTIVE_SESSIONS: '/api/sessions',
  SESSION_BY_ID: '/api/sessions/:id',

  // Health and status
  HEALTH: '/api/health',
} as const;

export type ApiRoutes = (typeof API_ROUTES)[keyof typeof API_ROUTES];
