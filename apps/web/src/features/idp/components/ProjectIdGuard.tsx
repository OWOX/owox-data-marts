import React, { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { PROJECT_PLACEHOLDER, resolveProjectPlaceholder } from '../../../utils/path';
import { useAuthState, useUser } from '../hooks';
import { signIn } from '../services';
import { normalizeProjectId } from '../utils/project-id';
import { FullScreenLoader } from '@owox/ui/components/common/loading-spinner';

/**
 * A React component that acts as a guard to ensure the user is accessing the correct project ID,
 * redirecting them to the authentication sign-in page if there's a mismatch between the URL's
 * project ID and the user's assigned project ID.
 *
 * @param {Object} props - The props object.
 * @param {React.ReactNode} props.children - The child components to render within the guard.
 * @return {React.ReactElement} Returns the rendered child elements if the guard conditions pass.
 */
export function ProjectIdGuard({ children }: { children: React.ReactNode }): React.ReactElement {
  const { isLoading } = useAuthState();
  const user = useUser();
  const { projectId: urlProjectId } = useParams<{ projectId?: string }>();
  const location = useLocation();

  const userProjectId = user?.projectId;
  const safeUrlProjectId = normalizeProjectId(urlProjectId);

  const isPlaceholder = urlProjectId === PROJECT_PLACEHOLDER;
  const hasMismatch =
    !isLoading &&
    !isPlaceholder &&
    !!safeUrlProjectId &&
    !!userProjectId &&
    userProjectId !== safeUrlProjectId;

  useEffect(() => {
    if (hasMismatch) {
      signIn({ projectId: safeUrlProjectId });
    }
  }, [hasMismatch, safeUrlProjectId]);

  if (!isLoading && isPlaceholder && userProjectId) {
    return (
      <Navigate
        replace
        to={resolveProjectPlaceholder(
          `${location.pathname}${location.search}${location.hash}`,
          userProjectId
        )}
      />
    );
  }

  if (isLoading || hasMismatch) return <FullScreenLoader />;

  return <>{children}</>;
}
