import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog/ConfirmationDialog';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../shared/components/CollapsibleCard';
import {
  deleteCloudProject,
  isCurrentProjectSession,
  type ProjectManagementSession,
} from './project-management.service';

export type ProjectDeletionOutcome = 'removed' | 'removing' | 'unknown';

export function ProjectDeletionCard({
  origin,
  session,
  title,
  removing,
  disabled,
  onResult,
}: {
  origin: string;
  session: ProjectManagementSession;
  title: string;
  removing: boolean;
  disabled: boolean;
  onResult: (status: ProjectDeletionOutcome) => void;
}) {
  const [open, setOpen] = useState(false);
  const deletion = useMutation({
    mutationFn: () => deleteCloudProject(origin, session),
    onSuccess: status => {
      setOpen(false);
      if (isCurrentProjectSession(session)) onResult(status);
    },
    onError: error => {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (
        (status === undefined || status === 408 || status >= 500) &&
        isCurrentProjectSession(session)
      ) {
        onResult('unknown');
      }
    },
  });
  const billingOutstanding =
    isAxiosError<{ code?: string } | null>(deletion.error) &&
    deletion.error.response?.status === 409 &&
    deletion.error.response.data?.code === 'PROJECT_BILLING_OUTSTANDING';

  return (
    <CollapsibleCard collapsible name='project-deletion'>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle icon={Trash2}>Project deletion</CollapsibleCardHeaderTitle>
      </CollapsibleCardHeader>
      <CollapsibleCardContent>
        <div className='dm-card flex flex-col items-start gap-3'>
          <p className='text-muted-foreground text-sm'>
            {removing
              ? 'Deletion is pending. Settle any outstanding billing, then try deleting this project again.'
              : 'Delete this project and end access for its members.'}
          </p>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={disabled}
            onClick={() => {
              deletion.reset();
              setOpen(true);
            }}
          >
            Delete project
          </Button>
        </div>
        <ConfirmationDialog
          open={open}
          onOpenChange={next => {
            if (!deletion.isPending) setOpen(next);
          }}
          title='Delete project?'
          description={`${title} will no longer be available to its members. This action cannot be undone.`}
          cancelLabel='Cancel'
          confirmLabel={deletion.isPending ? 'Deleting…' : 'Delete project'}
          confirmDisabled={disabled || deletion.isPending}
          cancelDisabled={deletion.isPending}
          showCloseButton={!deletion.isPending}
          onConfirm={() => {
            if (!disabled && !deletion.isPending) deletion.mutate();
          }}
        >
          {deletion.isError && (
            <p role='alert' className='text-destructive text-sm'>
              {billingOutstanding
                ? 'Settle any open invoices or negative balance before deleting this project.'
                : 'Could not confirm deletion. Check the project status before trying again.'}
            </p>
          )}
        </ConfirmationDialog>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}
