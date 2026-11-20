import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog/ConfirmationDialog';
import { StatusLabel, StatusTypeEnum } from '../../shared/components/StatusLabel';
import type { AccountProfile } from './account-profile.service';

interface AccountErasureCardProps {
  request: AccountProfile['erasureRequest'];
  viewOnly: boolean;
  busy: boolean;
  error?: string;
  onChange: (requestId?: string) => Promise<void>;
}

export function AccountErasureCard({
  request,
  viewOnly,
  busy,
  error,
  onChange,
}: AccountErasureCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pending = request?.status === 'pending';

  return (
    <section
      className='dm-card flex flex-col items-start gap-3'
      aria-labelledby='account-erasure-heading'
    >
      <div className='flex w-full flex-wrap items-center justify-between gap-2'>
        <h2 id='account-erasure-heading' className='text-base font-medium'>
          Account deletion
        </h2>
        {request && (
          <StatusLabel type={pending ? StatusTypeEnum.NEUTRAL : StatusTypeEnum.INFO}>
            {pending ? 'Pending' : 'Confirmed'}
          </StatusLabel>
        )}
      </div>
      {request ? (
        <>
          <p className='text-muted-foreground text-sm'>
            {pending
              ? 'You can cancel your request before it’s confirmed.'
              : 'Your deletion request is being processed.'}
          </p>
          {pending && !viewOnly && (
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => void onChange(request.id).catch(() => undefined)}
            >
              Cancel deletion request
            </Button>
          )}
        </>
      ) : (
        <>
          <p className='text-muted-foreground text-sm'>
            Request deletion of your Cloud account and personal data.
          </p>
          {!viewOnly && (
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => {
                setConfirmOpen(true);
              }}
            >
              Request account deletion
            </Button>
          )}
        </>
      )}
      {error && !confirmOpen && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      {!viewOnly && (
        <ConfirmationDialog
          open={confirmOpen}
          onOpenChange={open => {
            if (!busy) setConfirmOpen(open);
          }}
          title='Request account deletion?'
          description='Your Cloud account and personal data will be deleted after the request is confirmed. You can cancel while the request is pending.'
          cancelLabel='Keep account'
          confirmLabel='Request deletion'
          confirmDisabled={busy}
          cancelDisabled={busy}
          showCloseButton={!busy}
          onConfirm={() => {
            void onChange()
              .then(() => {
                setConfirmOpen(false);
              })
              .catch(() => undefined);
          }}
        >
          {error && (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          )}
        </ConfirmationDialog>
      )}
    </section>
  );
}
