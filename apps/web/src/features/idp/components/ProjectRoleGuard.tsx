import type { ReactElement, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { FullScreenLoader } from '@owox/ui/components/common/loading-spinner';
import { buildProjectPath } from '../../../utils/path';
import { useAuthState, useUser } from '../hooks';
import {
  buildProjectRequestAccessPath,
  getSafeProjectRedirect,
  isProjectRequestAccessPath,
} from '../../user-provisioning/utils/request-access-routing';

export function ProjectRoleGuard({ children }: { children: ReactNode }): ReactElement {
  const { isLoading } = useAuthState();
  const user = useUser();
  const location = useLocation();

  if (isLoading || !user) {
    return <FullScreenLoader />;
  }

  const hasEmptyProjectRoles = Array.isArray(user.roles) && user.roles.length === 0;
  const isRequestAccessPath = isProjectRequestAccessPath(location.pathname, user.projectId);
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;

  if (hasEmptyProjectRoles && !isRequestAccessPath) {
    return <Navigate to={buildProjectRequestAccessPath(user.projectId, currentUrl)} replace />;
  }

  if (!hasEmptyProjectRoles && isRequestAccessPath) {
    return (
      <Navigate
        to={
          getSafeProjectRedirect(location.search, user.projectId) ??
          buildProjectPath(user.projectId, '/data-marts')
        }
        replace
      />
    );
  }

  return <>{children}</>;
}
