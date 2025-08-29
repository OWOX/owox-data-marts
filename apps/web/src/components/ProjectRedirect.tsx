import { Navigate } from 'react-router-dom';
import { useAuth } from '../features/idp';
import { AuthStatus } from '../features/idp/types';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';

/**
 * Component that redirects to the project-scoped route
 * Used for root path redirect
 */
export function ProjectRedirect({ to = '/data-marts' }: { to?: string }) {
  const { user, status } = useAuth();
  
  if (status === AuthStatus.LOADING) {
    return <LoadingSpinner fullScreen message='Loading...' />
  }
  
  if (status === AuthStatus.UNAUTHENTICATED || !user) {
    return <LoadingSpinner fullScreen message='Authentication...' />
  }
  
  if (user.projectId) {
    const projectPath = `/ui/${user.projectId}${to.startsWith('/') ? to : `/${to}`}`;
    return <Navigate to={projectPath} replace />;
  }
  
  return <LoadingSpinner fullScreen message='Project not found' />
}