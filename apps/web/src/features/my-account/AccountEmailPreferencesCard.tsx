import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import {
  SwitchItemCard,
  SwitchItemCardContent,
  SwitchItemCardDescription,
  SwitchItemCardTitle,
  SwitchItemCardToggle,
} from '@owox/ui/components/common/switch-item-card';
import { Label } from '@owox/ui/components/label';
import {
  getAccountEmailPreferences,
  updateAccountEmailPreference,
  type AccountEmailTopic,
} from './account-profile.service';

const topicText: Record<string, { label: string; description: string } | undefined> = {
  ServiceNotifications: {
    label: 'Service notifications',
    description: 'Updates about OWOX services.',
  },
  PerformanceSuggestions: {
    label: 'Tips and suggestions',
    description: 'Advice on using OWOX and improving your workflows.',
  },
  Offers: {
    label: 'Offers',
    description: 'Promotions and special offers from OWOX.',
  },
};

export function AccountEmailPreferencesCard({
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
  const queryClient = useQueryClient();
  const queryKey = ['account-email-preferences', origin, userId, viewOnly];
  const preferences = useQuery({
    queryKey,
    queryFn: ({ signal }) => getAccountEmailPreferences(origin, accessToken, signal),
    gcTime: 0,
  });
  const change = useMutation({
    mutationFn: (topic: AccountEmailTopic) =>
      updateAccountEmailPreference(origin, accessToken, topic),
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
      {preferences.data.length ? (
        <div className='flex flex-col gap-3' aria-busy={change.isPending}>
          {preferences.data.map(({ id, subscribed }) => {
            const copy = Object.prototype.hasOwnProperty.call(topicText, id)
              ? topicText[id]
              : undefined;
            const controlId = `email-topic-${id}`;
            return (
              <SwitchItemCard key={id}>
                <SwitchItemCardToggle
                  id={controlId}
                  aria-describedby={copy ? `${controlId}-description` : undefined}
                  checked={subscribed}
                  disabled={viewOnly || change.isPending}
                  loading={change.isPending && change.variables.id === id}
                  tooltipTextSwitchOn='Turn off emails for this topic'
                  tooltipTextSwitchOff='Turn on emails for this topic'
                  tooltipTextSwitchDisabled={
                    viewOnly ? 'Read-only mode' : 'Saving email preferences'
                  }
                  onCheckedChange={checked => {
                    if (!viewOnly && !change.isPending) change.mutate({ id, subscribed: checked });
                  }}
                />
                <SwitchItemCardContent className='min-w-0 pr-4'>
                  <SwitchItemCardTitle>
                    <Label htmlFor={controlId}>
                      {copy?.label ?? id.replace(/([a-z])([A-Z])/g, '$1 $2')}
                    </Label>
                  </SwitchItemCardTitle>
                  {copy && (
                    <SwitchItemCardDescription id={`${controlId}-description`}>
                      {copy.description}
                    </SwitchItemCardDescription>
                  )}
                </SwitchItemCardContent>
              </SwitchItemCard>
            );
          })}
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>No email topics are available.</p>
      )}
      {change.isError && (
        <p className='text-destructive text-sm' role='alert'>
          Could not update your email preference. Try again.
        </p>
      )}
    </section>
  );
}
