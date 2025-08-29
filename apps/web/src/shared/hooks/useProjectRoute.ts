import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectId } from './useProjectId';

/**
 * Navigation options for project-scoped routing
 */
interface ProjectNavigateOptions {
  replace?: boolean;
  state?: unknown;
}

/**
 * Hook for navigation with automatic project ID inclusion
 */
export function useProjectRoute() {

  const reactRouterNavigate = useNavigate();
  const projectId = useProjectId();

  /**
   * Navigate to a route with project ID automatically prepended
   * @param path - The path relative to the project (e.g., '/data-marts', '/data-marts/123/overview')
   * @param options - Navigation options
   */
  const navigate = useCallback(
    (path: string, options?: ProjectNavigateOptions) => {
      if (!projectId) {
        void reactRouterNavigate('/', { replace: true });
        return;
      }
      
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const projectPath = `/ui/${projectId}${normalizedPath}`;
      
      void reactRouterNavigate(projectPath, options);
    },
    [reactRouterNavigate, projectId]
  );

  /**
   * Generate a project-scoped URL
   * @param path - The path relative to the project
   * @returns Full path with project ID or fallback path
   */
  const scope = useCallback(
    (path: string): string => {
      if (!projectId) {
        return path;
      }
      
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const scopedPath = `/ui/${projectId}${normalizedPath}`;
      
      return scopedPath;
    },
    [projectId]
  );

  const hookResult = useMemo(() => ({
    navigate,
    scope,
    projectId,
  }), [navigate, scope, projectId]);

  return hookResult;
}