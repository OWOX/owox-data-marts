import { useId, useState, type SubmitEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Pencil } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { useAppDispatch } from '../../../app/store/core/store-hooks';
import { setProject } from '../../../app/store/reducers/project.reducer';
import { useProjects } from '../../idp/hooks/useProjects';
import {
  isCurrentProjectSession,
  renameCloudProject,
  type ProjectManagementSession,
} from './project-management.service';

export function ProjectNameEditor({
  origin,
  session,
  title,
  readOnly,
}: {
  origin: string;
  session: ProjectManagementSession;
  title: string;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<string>();
  const errorId = useId();
  const dispatch = useAppDispatch();
  const { loadProjects } = useProjects();
  const rename = useMutation({
    mutationFn: (name: string) => renameCloudProject(origin, session, name),
    onSuccess: project => {
      if (!isCurrentProjectSession(session)) return;
      dispatch(setProject({ id: project.projectId, title: project.projectTitle }));
      setDraft(undefined);
      void loadProjects({ force: true });
    },
  });
  const name = rename.data?.projectTitle ?? title;
  const invalidName = isAxiosError(rename.error) && rename.error.response?.status === 400;

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rename.isPending || readOnly || !draft?.trim()) return;
    const selectedName = draft.trim();
    if (selectedName === name) setDraft(undefined);
    else rename.mutate(selectedName);
  }

  if (readOnly) return <span className='break-words'>{name}</span>;

  if (draft === undefined) {
    return (
      <span className='flex items-center gap-2'>
        <span className='min-w-0 break-words'>{name}</span>
        <Button
          type='button'
          size='icon-sm'
          variant='ghost'
          aria-label='Edit project name'
          onClick={() => {
            setDraft(name);
          }}
        >
          <Pencil aria-hidden='true' />
        </Button>
      </span>
    );
  }

  return (
    <form className='flex flex-col gap-2' onSubmit={save}>
      <Input
        aria-label='Project name'
        aria-invalid={invalidName}
        aria-describedby={rename.isError ? errorId : undefined}
        value={draft}
        onChange={event => {
          setDraft(event.target.value);
          if (rename.isError) rename.reset();
        }}
        disabled={rename.isPending}
        required
      />
      {rename.isError && (
        <p id={errorId} role='alert' className='text-destructive text-xs'>
          {invalidName
            ? 'Enter a valid project name and try again.'
            : 'Could not save the project name. Try again.'}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={rename.isPending}
          onClick={() => {
            rename.reset();
            setDraft(undefined);
          }}
        >
          Cancel
        </Button>
        <Button type='submit' size='sm' disabled={!draft.trim() || rename.isPending}>
          {rename.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
