/**
 * Utility functions for path configuration
 */

/**
 * Default path prefix for the application
 */
export const DEFAULT_APP_PATH_PREFIX = '/ui';

/**
 * Get the configurable path prefix for the application
 * @returns The path prefix (e.g., '/ui')
 */
export const getPathPrefix = (): string => {
  const envPrefix = import.meta.env.VITE_APP_PATH_PREFIX as string | undefined;
  return envPrefix ?? DEFAULT_APP_PATH_PREFIX;
};

/**
 * Build a project-scoped path with the configurable prefix
 * @param projectId - The project identifier
 * @param path - The path relative to the project
 * @returns Full path with prefix and project ID
 */
export const buildProjectPath = (projectId: string, path: string): string => {
  const prefix = getPathPrefix();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${prefix}/${projectId}${normalizedPath}`;
};