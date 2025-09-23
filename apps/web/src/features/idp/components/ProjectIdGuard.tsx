import React, { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useAuthState, useUser } from '../hooks';

/**
 * A React component that acts as a guard to ensure the user is accessing the correct project ID,
 * redirecting them to the authentication sign-in page if there's a mismatch between the URL's
 * project ID and the user's assigned project ID.
 *
 * @param {Object} props - The props object.
 * @param {React.ReactNode} props.children - The child components to render within the guard.
 * @return {React.ReactElement} Returns the rendered child elements if the guard conditions pass.
 */
export function ProjectIdGuard({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuthState();
  const user = useUser();
  const params = useParams<{ projectId?: string }>();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) return;

    const urlProjectId = params.projectId;
    const userProjectId = user?.projectId;

    if (!urlProjectId) return;

    if (location.pathname.startsWith('/auth')) return;

    if (user && userProjectId && userProjectId !== urlProjectId) {
      const search = new URLSearchParams({ projectId: urlProjectId }).toString();
      window.location.href = `/auth/sign-in?${search}`;
    }
  }, [isLoading, user, params.projectId, location.pathname]);

  return <>{children}</>;
}
