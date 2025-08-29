import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectId } from './useProjectId';

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
    (path: string, options?: { replace?: boolean; state?: unknown }) => {
      console.log('navigateToProject', path, options);
      if (!projectId) {
        console.warn('Cannot navigate: Project ID is not available');
        return;
      }
      const projectPath = `/ui/${projectId}${path.startsWith('/') ? path : `/${path}`}`;
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
        return path; // Return original path as fallback
      }
      return `/ui/${projectId}${path.startsWith('/') ? path : `/${path}`}`;
    },
    [projectId]
  );

  return {
    navigate,
    scope,
    projectId,
  };
}