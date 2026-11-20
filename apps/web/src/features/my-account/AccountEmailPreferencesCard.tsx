import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import {
  getAccountEmailPreferences,
  updateAccountEmailPreference,
  type AccountEmailTopic,
  type AccountSession,
} from './account-profile.service';

import { EmailTopicSwitches } from './EmailTopicSwitches';

export function AccountEmailPreferencesCard({
  origin,
  session,
  viewOnly,
}: {
  origin: string;
  session: AccountSession;
  viewOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = [
    'account-email-preferences',
    origin,
    session.userId,
    session.projectId,
    viewOnly,
  ];
  const preferences = useQuery({
    queryKey,
    queryFn: ({ signal }) => getAccountEmailPreferences(origin, session, signal),
    gcTime: 0,
  });
  const change = useMutation({
    mutationFn: (topic: AccountEmailTopic) => updateAccountEmailPreference(origin, session, topic),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (preferences.isPending) return <LoadingSpinner message='Loading email preferences...' />;
  if (preferences.isError) {
    return (
      <Alert variant='destructive'>
        <AlertCircle aria-hidden='true' />
        <AlertTitle>Could not load your email preferences</AlertTitle>
        <AlertDescription className='mt-2'>
          <Button size='sm' variant='outline' onClick={() => void preferences.refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section className='dm-card flex flex-col gap-3' aria-label='Email topics'>
      <EmailTopicSwitches
        topics={preferences.data}
        viewOnly={viewOnly}
        saving={change.isPending}
        savingId={change.variables?.id}
        onChange={topic => {
          change.mutate(topic);
        }}
      />
      {change.isError && (
        <p className='text-destructive text-sm' role='alert'>
          Could not update your email preference. Try again.
        </p>
      )}
    </section>
  );
}
