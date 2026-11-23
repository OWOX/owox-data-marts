import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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

export function ProjectDeletionCard({
  origin,
  session,
  title,
  removing,
  onResult,
}: {
  origin: string;
  session: ProjectManagementSession;
  title: string;
  removing: boolean;
  onResult: (status: 'removed' | 'removing') => void;
}) {
  const [open, setOpen] = useState(false);
  const deletion = useMutation({
    mutationFn: () => deleteCloudProject(origin, session),
    onSuccess: status => {
      setOpen(false);
      if (isCurrentProjectSession(session)) onResult(status);
    },
  });

  return (
    <CollapsibleCard collapsible name='project-deletion'>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle icon={Trash2}>Project deletion</CollapsibleCardHeaderTitle>
      </CollapsibleCardHeader>
      <CollapsibleCardContent>
        <div className='dm-card flex flex-col items-start gap-3'>
          <p className='text-muted-foreground text-sm'>
            {removing
              ? 'Your project will be deleted once its outstanding billing is settled.'
              : 'Delete this project and end access for its members.'}
          </p>
          {!removing && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                deletion.reset();
                setOpen(true);
              }}
            >
              Delete project
            </Button>
          )}
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
          confirmDisabled={deletion.isPending}
          cancelDisabled={deletion.isPending}
          showCloseButton={!deletion.isPending}
          onConfirm={() => {
            if (!deletion.isPending) deletion.mutate();
          }}
        >
          {deletion.isError && (
            <p role='alert' className='text-destructive text-sm'>
              Could not delete the project. Refresh the page to check its status before trying
              again.
            </p>
          )}
        </ConfirmationDialog>
      </CollapsibleCardContent>
    </CollapsibleCard>
  );
}
