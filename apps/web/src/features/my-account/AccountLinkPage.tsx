import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Button } from '@owox/ui/components/button';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import { appFlagsService } from '../../app/services/app-flags.service';
import { ThemeProvider } from '../../app/providers/theme-provider';
import { StatusLabel, StatusTypeEnum } from '../../shared/components/StatusLabel';
import { getAccountApiOrigin } from './use-account-api-origin';
import { EmailTopicSwitches } from './EmailTopicSwitches';
import {
  downloadPersonalDataByLink,
  parseAccountLink,
  updateEmailPreferenceByLink,
  type EmailLink,
  type SignedEmailPreferences,
  type SubscriptionLink,
} from './account-link.service';

/** Public capability-link flow: no authentication, project initialization or analytics. */
export function AccountLinkPage({ action }: { action: 'subscriptions' | 'export' }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const link = useMemo(() => parseAccountLink(params, action), [params, action]);
  const flags = useQuery({
    queryKey: ['public-account-flags'],
    queryFn: ({ signal }) => appFlagsService.getPublicFlags(signal),
    enabled: link.success,
    staleTime: Infinity,
    refetchOnReconnect: false,
  });
  const origin = getAccountApiOrigin(flags.data);
  const title = action === 'subscriptions' ? 'Email preferences' : 'Personal data';

  let content: ReactNode;
  if (!link.success) {
    content = <LinkError>Open the full link from your OWOX email.</LinkError>;
  } else if (flags.isPending) {
    content = <LoadingSpinner message='Loading profile settings...' />;
  } else if (flags.isError && !origin) {
    content = (
      <>
        <LinkError>Could not load profile settings. Try again.</LinkError>
        <Button variant='outline' onClick={() => void flags.refetch()}>
          Try again
        </Button>
      </>
    );
  } else if (!origin) {
    content = <LinkError>This link is available only in OWOX Cloud.</LinkError>;
  } else if (action === 'subscriptions') {
    content = (
      <EmailLinkPreferences
        key={location.key}
        origin={origin}
        link={link.data as SubscriptionLink}
      />
    );
  } else {
    content = <EmailLinkExport key={location.key} origin={origin} link={link.data} />;
  }

  return (
    <ThemeProvider>
      <meta name='referrer' content='no-referrer' />
      <div className='bg-background flex min-h-dvh flex-col items-center justify-center gap-3 p-4'>
        <main className='bg-card text-card-foreground flex w-full max-w-lg flex-col items-start gap-4 rounded-lg p-6 shadow-lg'>
          <h1 className='text-lg font-semibold'>{title}</h1>
          {content}
        </main>
      </div>
    </ThemeProvider>
  );
}

function LinkError({ children }: { children: ReactNode }) {
  return (
    <p role='alert' className='text-destructive text-sm'>
      {children}
    </p>
  );
}

function EmailLinkExport({ origin, link }: { origin: string; link: EmailLink }) {
  const download = useMutation({
    mutationFn: () => downloadPersonalDataByLink(origin, link),
    gcTime: 0,
  });
  return (
    <>
      <p className='text-muted-foreground text-sm'>
        Download your profile information and details about how OWOX uses your personal data.
      </p>
      <Button
        disabled={download.isPending}
        onClick={() => {
          download.mutate();
        }}
      >
        {download.isPending ? 'Preparing download...' : 'Download personal data'}
      </Button>
      {download.isError && (
        <LinkError>
          Could not download your data. Open the link from your email and try again.
        </LinkError>
      )}
    </>
  );
}

function EmailLinkPreferences({ origin, link }: { origin: string; link: SubscriptionLink }) {
  const [preferences, setPreferences] = useState<SignedEmailPreferences>();
  const started = useRef(false);
  const { mutate, isPending, isError, variables } = useMutation({
    mutationFn: ({ proof, subscribed }: { proof: SubscriptionLink; subscribed: boolean }) =>
      updateEmailPreferenceByLink(origin, proof, subscribed),
    onSuccess: setPreferences,
    gcTime: 0,
  });
  useEffect(() => {
    // Strict Mode's effect replay must not emit the unsubscribe event twice.
    if (started.current) return;
    started.current = true;
    mutate({ proof: link, subscribed: false });
  }, [link, mutate]);

  if (!preferences) {
    return isError ? (
      <>
        <LinkError>
          Could not update your email preferences. The link may be invalid or expired.
        </LinkError>
        <Button
          variant='outline'
          disabled={isPending}
          onClick={() => {
            mutate({ proof: link, subscribed: false });
          }}
        >
          Try again
        </Button>
      </>
    ) : (
      <LoadingSpinner message='Updating email preferences...' />
    );
  }

  return (
    <>
      {!isError && (
        <p role='status'>
          <StatusLabel type={isPending ? StatusTypeEnum.NEUTRAL : StatusTypeEnum.SUCCESS}>
            {isPending ? 'Saving email preferences...' : 'Email preferences updated'}
          </StatusLabel>
        </p>
      )}
      <p className='text-muted-foreground text-sm'>
        You can choose which emails you receive below.
      </p>
      <div className='w-full'>
        <EmailTopicSwitches
          topics={preferences.topics}
          saving={isPending}
          savingId={variables?.proof.topicId}
          onChange={({ id, subscribed }) => {
            const topic = preferences.topics.find(topic => topic.id === id);
            if (topic)
              mutate({ proof: { ...link, topicId: id, signature: topic.signature }, subscribed });
          }}
        />
      </div>
      {isError && <LinkError>Could not save your email preference. Try again.</LinkError>}
    </>
  );
}
