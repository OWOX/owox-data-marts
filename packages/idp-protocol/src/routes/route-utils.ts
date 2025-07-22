import type { AuthPageRoutes, AuthApiRoutes } from './auth-routes.js';
import type { ApiRoutes } from './api-routes.js';

/**
 * Utility functions for working with IDP routes
 */

/**
 * Build a complete route path with base URL
 */
export function buildRoute(
  baseUrl: string,
  route: AuthPageRoutes | AuthApiRoutes | ApiRoutes,
  params?: Record<string, string>
): string {
  let fullRoute = `${baseUrl.replace(/\/$/, '')}${route}`;

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      fullRoute = fullRoute.replace(`:${key}`, encodeURIComponent(value));
    });
  }

  return fullRoute;
}

/**
 * Extract route parameters from path
 */
export function extractRouteParams(route: string, actualPath: string): Record<string, string> {
  const routeParts = route.split('/');
  const pathParts = actualPath.split('/');
  const params: Record<string, string> = {};

  routeParts.forEach((part, index) => {
    if (part.startsWith(':')) {
      const paramName = part.substring(1);
      const paramValue = pathParts[index];
      if (paramValue) {
        params[paramName] = decodeURIComponent(paramValue);
      }
    }
  });

  return params;
}

/**
 * Check if a path matches a route pattern
 */
export function matchesRoute(routePattern: string, actualPath: string): boolean {
  const routeParts = routePattern.split('/');
  const pathParts = actualPath.split('/');

  if (routeParts.length !== pathParts.length) {
    return false;
  }

  return routeParts.every((part, index) => {
    if (part.startsWith(':')) {
      return true; // Parameter can match any value
    }
    return part === pathParts[index];
  });
}

/**
 * Validate required parameters in route
 */
export function validateRouteParams(
  route: string,
  params: Record<string, string>,
  required: string[] = []
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  // Extract parameter names from route
  const routeParams = route.match(/:(\w+)/g)?.map(param => param.substring(1)) || [];

  // Check required parameters
  required.forEach(param => {
    if (!params[param]) {
      missing.push(param);
    }
  });

  // Check that all route parameters are provided
  routeParams.forEach(param => {
    if (!params[param]) {
      missing.push(param);
    }
  });

  return {
    valid: missing.length === 0,
    missing: [...new Set(missing)], // Remove duplicates
  };
}
