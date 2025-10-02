import { useAuth } from '../../features/idp';
import { AuthStatus } from '../../features/idp/types';

/**
 * Hook to get the current project ID from the authentication context
 * @returns The project ID of the currently authenticated user or null if not available
 */
export function useProjectId(): string | null {
  const { user, status } = useAuth();

  if (status === AuthStatus.LOADING || status === AuthStatus.UNAUTHENTICATED || !user?.projectId) {
    return null;
  }

  return user.projectId;
}
