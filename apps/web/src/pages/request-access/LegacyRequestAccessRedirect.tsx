import { Navigate, useLocation } from 'react-router-dom';
import { FullScreenLoader } from '@owox/ui/components/common/loading-spinner';
import { useAuth } from '../../features/idp';
import { AuthStatus } from '../../features/idp/types';
import {
  buildProjectRequestAccessPath,
  getSafeProjectRedirect,
} from '../../features/user-provisioning/utils/request-access-routing';
import { buildProjectPath } from '../../utils/path';

export function LegacyRequestAccessRedirect() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === AuthStatus.LOADING) {
    return <FullScreenLoader />;
  }

  if (status !== AuthStatus.AUTHENTICATED || !user) {
    return <FullScreenLoader />;
  }

  const hasEmptyProjectRoles = Array.isArray(user.roles) && user.roles.length === 0;
  const redirectTo =
    getSafeProjectRedirect(location.search, user.projectId) ??
    buildProjectPath(user.projectId, '/data-marts');

  if (!hasEmptyProjectRoles) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Navigate to={buildProjectRequestAccessPath(user.projectId, redirectTo)} replace />;
}
