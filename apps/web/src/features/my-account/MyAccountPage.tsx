import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Eye } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, NavLink, useLocation } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import { cn } from '@owox/ui/lib/utils';
import { useFlags } from '../../app/store/hooks';
import { useAuthState } from '../idp/hooks/useAuthState';
import {
  MY_ACCOUNT_EMAIL_PATH,
  MY_ACCOUNT_PATH,
  MY_ACCOUNT_PROJECTS_PATH,
} from '../idp/utils/my-account-path';
import { buildProjectPath } from '../../utils/path';
import { RequestStatus } from '../../shared/types/request-status';
import { getCloudProjectApiOrigin } from '../project-settings/management/project-management.service';
import {
  getAccountProfile,
  updateAccountProfile,
  updateErasureRequest,
  type AccountSession,
} from './account-profile.service';
import { AccountProfileCard } from './AccountProfileCard';
import { AccountErasureCard } from './AccountErasureCard';
import { AccountDataExportCard } from './AccountDataExportCard';
import { AccountProjectsCard } from './AccountProjectsCard';
import { AccountEmailPreferencesCard } from './AccountEmailPreferencesCard';
import { getAccountApiOrigin } from './use-account-api-origin';

const projectsTab = { label: 'Projects', path: MY_ACCOUNT_PROJECTS_PATH };
const navigation = [
  { label: 'Overview', path: MY_ACCOUNT_PATH },
  projectsTab,
  { label: 'Email preferences', path: MY_ACCOUNT_EMAIL_PATH },
];

export function MyAccountPage({
  section = 'profile',
}: {
  section?: 'profile' | 'projects' | 'email-preferences';
}) {
  const { callState, flags } = useFlags();
  const origin = getAccountApiOrigin(flags);
  const { isAuthenticated, session, user } = useAuthState();
  const navigationState: unknown = useLocation().state;

  if (
    !isAuthenticated ||
    !session?.accessToken ||
    !user ||
    callState === RequestStatus.IDLE ||
    callState === RequestStatus.LOADING
  ) {
    return <LoadingSpinner fullScreen message='Loading your profile...' />;
  }
  if (!origin && (section !== 'projects' || !getCloudProjectApiOrigin(flags))) {
    return <Navigate to='/' replace />;
  }

  const currentProjectUnavailable =
    typeof navigationState === 'object' &&
    navigationState !== null &&
    (('unavailableProjectId' in navigationState &&
      navigationState.unavailableProjectId === user.projectId) ||
      ('deletedProjectId' in navigationState &&
        navigationState.deletedProjectId === user.projectId));
  const tabs = origin ? navigation : [projectsTab];
  const needsProjectAccess = user.roles?.length === 0;
  const projectPath = buildProjectPath(
    user.projectId,
    needsProjectAccess ? '/request-access' : '/data-marts'
  );
  const viewOnly = user.viewOnly === true;
  const account = {
    session: { userId: user.id, projectId: user.projectId },
    viewOnly,
  };

  return (
    <div className='dm-page-content pb-6'>
      <header
        className={cn(
          'flex min-w-0 items-center gap-2 py-4 md:py-6',
          !currentProjectUnavailable && 'md:-ml-10'
        )}
      >
        {!currentProjectUnavailable && (
          <Button variant='ghost' size='icon-sm' asChild>
            <Link
              to={projectPath}
              aria-label={needsProjectAccess ? 'Back to Request access' : 'Back to Data Marts'}
            >
              <ArrowLeft aria-hidden='true' />
            </Link>
          </Button>
        )}
        <h1 className='dm-page-header-title'>My profile</h1>
      </header>
      <nav
        aria-label='My profile'
        className='no-scrollbar flex gap-2 overflow-x-auto border-b whitespace-nowrap'
      >
        {tabs.map(({ label, path }) => (
          <NavLink
            key={path}
            to={path}
            state={currentProjectUnavailable ? navigationState : undefined}
            end
            className={({ isActive }) =>
              cn(
                'border-b-2 px-4 py-4 text-sm font-medium whitespace-nowrap',
                isActive
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className='flex flex-col gap-4 pt-4'>
        {viewOnly && (
          <Alert role='status'>
            <Eye aria-hidden='true' />
            <AlertDescription>You are viewing this profile in read-only mode.</AlertDescription>
          </Alert>
        )}
        {origin && section === 'profile' && (
          <AccountDetails key={user.id} origin={origin} {...account} />
        )}
        {section === 'projects' && (
          <AccountProjectsCard flags={flags} userId={user.id} viewOnly={viewOnly} />
        )}
        {origin && section === 'email-preferences' && (
          <AccountEmailPreferencesCard key={user.id} origin={origin} {...account} />
        )}
      </div>
    </div>
  );
}

function AccountDetails({
  origin,
  session,
  viewOnly,
}: {
  origin: string;
  session: AccountSession;
  viewOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['account-profile', origin, session.userId, session.projectId, viewOnly];
  const profile = useQuery({
    queryKey,
    queryFn: ({ signal }) => getAccountProfile(origin, session, signal),
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: (fields: Parameters<typeof updateAccountProfile>[2]) =>
      updateAccountProfile(origin, session, fields),
    onSuccess: data => {
      queryClient.setQueryData(queryKey, data);
      setEditing(false);
    },
  });
  const erasure = useMutation({
    mutationFn: (requestId?: string) => updateErasureRequest(origin, session, requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (profile.isPending) return <LoadingSpinner message='Loading profile...' />;
  if (profile.isError) {
    return (
      <Alert variant='destructive'>
        <AlertCircle aria-hidden='true' />
        <AlertTitle>Could not load your profile</AlertTitle>
        <AlertDescription className='mt-2'>
          <Button size='sm' variant='outline' onClick={() => void profile.refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <AccountProfileCard
        profile={profile.data}
        viewOnly={viewOnly}
        editing={editing && !viewOnly}
        saving={save.isPending}
        error={
          save.isError
            ? 'Could not save your profile. Check your details and try again.'
            : undefined
        }
        onEdit={() => {
          save.reset();
          setEditing(true);
        }}
        onCancel={() => {
          setEditing(false);
        }}
        onSave={fields => {
          if (!viewOnly) save.mutate(fields);
        }}
      />
      <AccountDataExportCard origin={origin} session={session} />
      <AccountErasureCard
        request={profile.data.erasureRequest}
        viewOnly={viewOnly}
        busy={erasure.isPending}
        error={erasure.isError ? 'Could not update your deletion request. Try again.' : undefined}
        onChange={async requestId => {
          if (viewOnly) return;
          await erasure.mutateAsync(requestId);
        }}
      />
    </>
  );
}
