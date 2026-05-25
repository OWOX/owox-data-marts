import { Navigate } from 'react-router-dom';
import { useAuth } from '../features/idp';
import { AuthStatus } from '../features/idp/types';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import { buildProjectPath } from '../utils/path';
import { buildProjectRequestAccessPath } from '../features/user-provisioning/utils/request-access-routing';

/**
 * Component that redirects to the project-scoped route
 * Used for root path redirect
 */
export function ProjectRedirect({ to = '/data-marts' }: { to?: string }) {
  const { user, status } = useAuth();

  if (status === AuthStatus.LOADING) {
    return <LoadingSpinner fullScreen message='Loading...' />;
  }

  if (status === AuthStatus.UNAUTHENTICATED || !user) {
    return <LoadingSpinner fullScreen message='Authentication...' />;
  }

  if (Array.isArray(user.roles) && user.roles.length === 0) {
    const redirectTo = buildProjectPath(user.projectId, to);
    return <Navigate to={buildProjectRequestAccessPath(user.projectId, redirectTo)} replace />;
  }

  if (user.projectId) {
    const projectPath = buildProjectPath(user.projectId, to);
    return <Navigate to={projectPath} replace />;
  }

  return <LoadingSpinner fullScreen message='Project not found' />;
}
