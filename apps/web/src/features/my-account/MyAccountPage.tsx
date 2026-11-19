import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Eye } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, NavLink } from 'react-router';
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
import {
  getAccountProfile,
  updateAccountProfile,
  updateErasureRequest,
} from './account-profile.service';
import { AccountProfileCard } from './AccountProfileCard';
import { AccountErasureCard } from './AccountErasureCard';
import { AccountProjectsCard } from './AccountProjectsCard';
import { AccountEmailPreferencesCard } from './AccountEmailPreferencesCard';
import { useAccountApiOrigin } from './use-account-api-origin';

const navigation = [
  { label: 'Overview', path: MY_ACCOUNT_PATH },
  { label: 'Projects', path: MY_ACCOUNT_PROJECTS_PATH },
  { label: 'Email preferences', path: MY_ACCOUNT_EMAIL_PATH },
];

export function MyAccountPage({
  section = 'profile',
}: {
  section?: 'profile' | 'projects' | 'email-preferences';
}) {
  const { callState } = useFlags();
  const origin = useAccountApiOrigin();
  const { isAuthenticated, session, user } = useAuthState();

  if (
    !isAuthenticated ||
    !session?.accessToken ||
    !user ||
    callState === RequestStatus.IDLE ||
    callState === RequestStatus.LOADING
  ) {
    return <LoadingSpinner fullScreen message='Loading your profile...' />;
  }
  if (!origin) return <Navigate to='/' replace />;

  const needsProjectAccess = user.roles?.length === 0;
  const projectPath = buildProjectPath(
    user.projectId,
    needsProjectAccess ? '/request-access' : '/data-marts'
  );
  const viewOnly = user.viewOnly === true;
  const account = { origin, userId: user.id, accessToken: session.accessToken, viewOnly };

  return (
    <div className='dm-page-content pb-6'>
      <header className='flex min-w-0 items-center gap-2 py-4 md:-ml-10 md:py-6'>
        <Button variant='ghost' size='icon-sm' asChild>
          <Link
            to={projectPath}
            aria-label={needsProjectAccess ? 'Back to Request access' : 'Back to Data Marts'}
          >
            <ArrowLeft aria-hidden='true' />
          </Link>
        </Button>
        <h1 className='dm-page-header-title'>My profile</h1>
      </header>
      <nav
        aria-label='My profile'
        className='no-scrollbar flex gap-2 overflow-x-auto border-b whitespace-nowrap'
      >
        {navigation.map(({ label, path }) => (
          <NavLink
            key={path}
            to={path}
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
            <AlertDescription>You are viewing this account in read-only mode.</AlertDescription>
          </Alert>
        )}
        {section === 'profile' && <AccountDetails key={user.id} {...account} />}
        {section === 'projects' && <AccountProjectsCard />}
        {section === 'email-preferences' && (
          <AccountEmailPreferencesCard key={user.id} {...account} />
        )}
      </div>
    </div>
  );
}

function AccountDetails({
  origin,
  userId,
  accessToken,
  viewOnly,
}: {
  origin: string;
  userId: string;
  accessToken: string;
  viewOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['account-profile', origin, userId, viewOnly];
  const profile = useQuery({
    queryKey,
    queryFn: ({ signal }) => getAccountProfile(origin, accessToken, signal),
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: (fields: Parameters<typeof updateAccountProfile>[2]) =>
      updateAccountProfile(origin, accessToken, fields),
    onSuccess: data => {
      queryClient.setQueryData(queryKey, data);
      setEditing(false);
    },
  });
  const erasure = useMutation({
    mutationFn: (requestId?: string) => updateErasureRequest(origin, accessToken, requestId),
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
