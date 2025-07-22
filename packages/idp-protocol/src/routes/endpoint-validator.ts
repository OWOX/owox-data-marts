import { IdpCapabilities } from '../types/capabilities.js';
import { AUTH_PAGE_ROUTES, AUTH_API_ROUTES } from './auth-routes.js';
import { API_ROUTES } from './api-routes.js';

/**
 * Validates if an endpoint is supported by the provider's capabilities
 */
export function isEndpointSupported(
  endpoint: string,
  method: string,
  capabilities: IdpCapabilities
): boolean {
  // Authentication Pages
  if (endpoint === AUTH_PAGE_ROUTES.SIGN_IN && method === 'GET') {
    return capabilities.authPages.signIn ?? false;
  }
  if (endpoint === AUTH_PAGE_ROUTES.SIGN_OUT && method === 'GET') {
    return capabilities.authPages.signOut ?? false;
  }
  if (endpoint === AUTH_PAGE_ROUTES.SIGN_UP && method === 'GET') {
    return capabilities.authPages.signUp ?? false;
  }
  if (endpoint === AUTH_PAGE_ROUTES.MAGIC_LINK && method === 'GET') {
    return capabilities.authPages.magicLink ?? false;
  }
  if (endpoint === AUTH_PAGE_ROUTES.GOOGLE_CALLBACK && method === 'GET') {
    return capabilities.authPages.socialAuth?.google ?? false;
  }
  if (endpoint === AUTH_PAGE_ROUTES.MICROSOFT_CALLBACK && method === 'GET') {
    return capabilities.authPages.socialAuth?.microsoft ?? false;
  }

  // Authentication API
  if (endpoint === AUTH_API_ROUTES.REFRESH && method === 'POST') {
    return capabilities.authApi.tokenRefresh ?? false;
  }
  if (endpoint === AUTH_API_ROUTES.REVOKE && method === 'POST') {
    return capabilities.authApi.tokenRevoke ?? false;
  }
  if (endpoint === AUTH_API_ROUTES.INTROSPECT && method === 'POST') {
    return capabilities.authApi.tokenIntrospection ?? false;
  }

  // Management API
  if (endpoint === API_ROUTES.USERS && method === 'GET') {
    return capabilities.managementApi.users?.list ?? false;
  }
  if (endpoint === API_ROUTES.USERS && method === 'POST') {
    return capabilities.managementApi.users?.create ?? false;
  }
  if (endpoint.match(/^\/api\/users\/[^/]+$/) && method === 'GET') {
    return capabilities.managementApi.users?.read ?? false;
  }
  if (endpoint.match(/^\/api\/users\/[^/]+$/) && method === 'PUT') {
    return capabilities.managementApi.users?.update ?? false;
  }
  if (endpoint.match(/^\/api\/users\/[^/]+$/) && method === 'DELETE') {
    return capabilities.managementApi.users?.delete ?? false;
  }

  if (endpoint === API_ROUTES.HEALTH && method === 'GET') {
    return capabilities.managementApi.health ?? false;
  }

  // Default: not supported
  return false;
}

/**
 * Get list of supported endpoints based on capabilities
 */
export function getSupportedEndpoints(
  capabilities: IdpCapabilities
): Array<{ endpoint: string; method: string; description: string }> {
  const endpoints: Array<{ endpoint: string; method: string; description: string }> = [];

  // Authentication Pages
  if (capabilities.authPages.signIn) {
    endpoints.push({
      endpoint: AUTH_PAGE_ROUTES.SIGN_IN,
      method: 'GET',
      description: 'Sign in page',
    });
  }
  if (capabilities.authPages.signOut) {
    endpoints.push({
      endpoint: AUTH_PAGE_ROUTES.SIGN_OUT,
      method: 'GET',
      description: 'Sign out page',
    });
  }
  if (capabilities.authPages.signUp) {
    endpoints.push({
      endpoint: AUTH_PAGE_ROUTES.SIGN_UP,
      method: 'GET',
      description: 'Sign up page',
    });
  }
  if (capabilities.authPages.magicLink) {
    endpoints.push({
      endpoint: AUTH_PAGE_ROUTES.MAGIC_LINK,
      method: 'GET',
      description: 'Magic link page',
    });
  }
  if (capabilities.authPages.socialAuth?.google) {
    endpoints.push({
      endpoint: AUTH_PAGE_ROUTES.GOOGLE_CALLBACK,
      method: 'GET',
      description: 'Google OAuth callback',
    });
  }
  if (capabilities.authPages.socialAuth?.microsoft) {
    endpoints.push({
      endpoint: AUTH_PAGE_ROUTES.MICROSOFT_CALLBACK,
      method: 'GET',
      description: 'Microsoft OAuth callback',
    });
  }

  // Authentication API
  if (capabilities.authApi.tokenRefresh) {
    endpoints.push({
      endpoint: AUTH_API_ROUTES.REFRESH,
      method: 'POST',
      description: 'Token refresh API',
    });
  }
  if (capabilities.authApi.tokenRevoke) {
    endpoints.push({
      endpoint: AUTH_API_ROUTES.REVOKE,
      method: 'POST',
      description: 'Token revoke API',
    });
  }
  if (capabilities.authApi.tokenIntrospection) {
    endpoints.push({
      endpoint: AUTH_API_ROUTES.INTROSPECT,
      method: 'POST',
      description: 'Token introspection API',
    });
  }

  // Management API
  if (capabilities.managementApi.users?.list) {
    endpoints.push({ endpoint: API_ROUTES.USERS, method: 'GET', description: 'List users' });
  }
  if (capabilities.managementApi.users?.create) {
    endpoints.push({ endpoint: API_ROUTES.USERS, method: 'POST', description: 'Create user' });
  }
  if (capabilities.managementApi.users?.read) {
    endpoints.push({
      endpoint: API_ROUTES.USER_BY_ID,
      method: 'GET',
      description: 'Get user by ID',
    });
  }
  if (capabilities.managementApi.users?.update) {
    endpoints.push({ endpoint: API_ROUTES.USER_BY_ID, method: 'PUT', description: 'Update user' });
  }
  if (capabilities.managementApi.users?.delete) {
    endpoints.push({
      endpoint: API_ROUTES.USER_BY_ID,
      method: 'DELETE',
      description: 'Delete user',
    });
  }

  if (capabilities.managementApi.health) {
    endpoints.push({ endpoint: API_ROUTES.HEALTH, method: 'GET', description: 'Health check' });
  }

  return endpoints;
}
