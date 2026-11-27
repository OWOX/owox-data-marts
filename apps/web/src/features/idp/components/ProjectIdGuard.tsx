import React, { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Button } from '@owox/ui/components/button';
import { useFlags } from '../../../app/store/hooks';
import { RequestStatus } from '../../../shared/types/request-status';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import {
  buildProjectPath,
  PROJECT_PLACEHOLDER,
  resolveProjectPlaceholder,
} from '../../../utils/path';
import { useAuthState, useUser } from '../hooks';
import { signIn, switchProject } from '../services';
import { normalizeProjectId } from '../utils/project-id';
import { FullScreenLoader } from '@owox/ui/components/common/loading-spinner';
import { CONNECT_SWITCH_ATTEMPT_KEY, getConnectProjectTarget } from '../utils/connect-project';

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
  const { flags, callState: flagsStatus } = useFlags();
  const { projectId: urlProjectId } = useParams<{ projectId?: string }>();
  const location = useLocation();
  const currentUrl = location.pathname + location.search + location.hash;

  const userProjectId = user?.projectId;
  const safeUrlProjectId = normalizeProjectId(urlProjectId);

  const isPlaceholder = urlProjectId === PROJECT_PLACEHOLDER;
  const hasMismatch =
    !isLoading &&
    !isPlaceholder &&
    !!safeUrlProjectId &&
    !!userProjectId &&
    userProjectId !== safeUrlProjectId;

  const flagsPending = flagsStatus === RequestStatus.IDLE || flagsStatus === RequestStatus.LOADING;
  const directSwitch =
    flags?.IDP_PROVIDER === 'owox-better-auth' && !getConnectProjectTarget(currentUrl);

  useEffect(() => {
    if (hasMismatch && !flagsPending && !directSwitch) {
      const connectTarget = getConnectProjectTarget(currentUrl);
      if (connectTarget) {
        if (sessionStorage.getItem(CONNECT_SWITCH_ATTEMPT_KEY) === connectTarget.url) {
          window.dispatchEvent(
            new CustomEvent('auth:logout', {
              detail: { reason: 'connect_project_mismatch', connectTarget: connectTarget.url },
            })
          );
          return;
        }
        sessionStorage.setItem(CONNECT_SWITCH_ATTEMPT_KEY, connectTarget.url);
        signIn({ projectId: connectTarget.projectId, redirect: connectTarget.url });
        return;
      }
      signIn({ projectId: safeUrlProjectId });
    }
  }, [hasMismatch, safeUrlProjectId, currentUrl, flagsPending, directSwitch]);

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

  if (hasMismatch && !flagsPending && directSwitch && user.id) {
    return (
      <SwitchProjectSession
        key={`${user.id}:${safeUrlProjectId}`}
        projectId={safeUrlProjectId}
        currentProjectId={userProjectId}
        userId={user.id}
      />
    );
  }
  if (hasMismatch) return <FullScreenLoader message='Switching project...' />;
  if (isLoading) return <FullScreenLoader />;

  return <>{children}</>;
}

function SwitchProjectSession({
  projectId,
  currentProjectId,
  userId,
}: {
  projectId: string;
  currentProjectId: string;
  userId: string;
}) {
  const [failure, setFailure] = useState<'expired' | 'unavailable' | 'retry' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<{ attempt: number; promise: Promise<void> } | null>(null);

  useEffect(() => {
    if (request.current?.attempt !== attempt) {
      request.current = { attempt, promise: switchProject(projectId, userId) };
    }

    let active = true;
    void request.current.promise.then(
      () => {
        if (active) window.location.reload();
      },
      (error: unknown) => {
        if (!active) return;
        const status = isAxiosError(error) ? error.response?.status : undefined;
        setFailure(status === 401 ? 'expired' : status === 403 ? 'unavailable' : 'retry');
      }
    );
    return () => {
      active = false;
    };
  }, [attempt, projectId, userId]);

  if (!failure) return <FullScreenLoader message='Switching project...' />;

  return (
    <div className='bg-background flex min-h-screen items-center justify-center p-4'>
      <div className='bg-card text-card-foreground w-full max-w-lg space-y-4 rounded-lg p-6 shadow-lg'>
        <h1 className='text-lg font-semibold'>Could not open project</h1>
        <p role='alert' className='text-muted-foreground text-sm'>
          {failure === 'expired'
            ? 'Your session expired. Sign in to continue.'
            : failure === 'unavailable'
              ? 'This project is unavailable for your current session.'
              : 'Try switching projects again or return to your current project.'}
        </p>
        <div className='flex flex-wrap gap-2'>
          {failure === 'expired' && (
            <Button
              onClick={() => {
                signIn({ projectId });
              }}
            >
              Sign in
            </Button>
          )}
          {failure === 'retry' && (
            <Button
              onClick={() => {
                setFailure(null);
                setAttempt(attempt + 1);
              }}
            >
              Try again
            </Button>
          )}
          <Button variant='outline' asChild>
            <Link to={buildProjectPath(currentProjectId, '/data-marts')}>Back to project</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
