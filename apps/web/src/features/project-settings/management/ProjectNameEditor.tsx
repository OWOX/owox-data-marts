import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Pencil } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button } from '@owox/ui/components/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { useAppDispatch } from '../../../app/store/core/store-hooks';
import { setProject } from '../../../app/store/reducers/project.reducer';
import { useProjects } from '../../idp/hooks/useProjects';
import {
  isCurrentProjectSession,
  renameCloudProject,
  type ProjectManagementSession,
} from './project-management.service';

// Match the title field in Analytics (Projects_Record_Field_Title and Projects/module.xml).
const maxProjectNameLength = 255;
const deniedProjectNameCharacters = /[^a-zA-Z0-9_→[\]*,.!() -]/u;
const projectNameCharactersMessage =
  'Use English letters, numbers, spaces, or _ → [ ] * , . - ! ( ).';
const projectNameLengthMessage = `Use up to ${String(maxProjectNameLength)} characters.`;
const renameProjectSchema = z.object({
  title: z
    .string()
    .refine(value => !deniedProjectNameCharacters.test(value), projectNameCharactersMessage)
    .transform(value => value.trim())
    .pipe(
      z.string().min(1, 'Enter a project name.').max(maxProjectNameLength, projectNameLengthMessage)
    ),
});

function getRenameError(status?: number) {
  switch (status) {
    case 401:
      return 'Sign in again to change the project name.';
    case 403:
      return 'You do not have permission to rename this project.';
    case 404:
      return 'This project is no longer available.';
    case 409:
      return 'This project is being removed. Its name cannot be changed.';
    default:
      return 'Could not save the project name. Try again.';
  }
}

export function ProjectNameEditor({
  origin,
  session,
  title,
  readOnly = false,
  projectPath,
  prepareSession,
}: {
  origin: string;
  session: ProjectManagementSession;
  title: string;
  readOnly?: boolean;
  projectPath?: string;
  prepareSession?: (session: ProjectManagementSession) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const form = useForm({
    resolver: zodResolver(renameProjectSchema),
    defaultValues: { title },
    mode: 'onChange',
  });
  const dispatch = useAppDispatch();
  const { loadProjects } = useProjects();
  const rename = useMutation({
    scope: { id: 'rename-cloud-project' },
    mutationFn: async (name: string) => {
      await prepareSession?.(session);
      return renameCloudProject(origin, session, name);
    },
    onError: error => {
      if (isAxiosError(error) && error.response?.status === 400) {
        form.setError('title', {
          type: 'server',
          message: `${projectNameLengthMessage} ${projectNameCharactersMessage}`,
        });
      }
    },
    onSuccess: project => {
      if (!isCurrentProjectSession(session)) return;
      dispatch(setProject({ id: project.projectId, title: project.projectTitle }));
      setEditing(false);
      void loadProjects({ force: true });
    },
  });
  const name = rename.data?.projectTitle ?? title;
  const errorStatus = isAxiosError(rename.error) ? rename.error.response?.status : undefined;
  const saveError = rename.isError && errorStatus !== 400 ? getRenameError(errorStatus) : undefined;

  function save({ title: selectedName }: z.infer<typeof renameProjectSchema>) {
    if (rename.isPending || readOnly) return;
    if (selectedName === name) setEditing(false);
    else rename.mutate(selectedName);
  }

  if (readOnly) return <span className='break-words'>{name}</span>;

  if (!editing) {
    return (
      <span className='flex items-center gap-2'>
        {projectPath ? (
          <Link
            className='min-w-0 font-medium break-words underline-offset-4 hover:underline'
            to={projectPath}
          >
            {name}
          </Link>
        ) : (
          <span className='min-w-0 break-words'>{name}</span>
        )}
        <Button
          type='button'
          size='icon-sm'
          variant='ghost'
          className='shrink-0'
          aria-label={projectPath ? `Edit project name for ${name}` : 'Edit project name'}
          onClick={() => {
            form.reset({ title: name });
            setEditing(true);
          }}
        >
          <Pencil aria-hidden='true' />
        </Button>
      </span>
    );
  }

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-2'
        onSubmit={event => void form.handleSubmit(save)(event)}
        noValidate
      >
        <FormField
          control={form.control}
          name='title'
          render={({ field }) => (
            <FormItem variant='light'>
              <FormControl>
                <Input
                  {...field}
                  autoFocus
                  aria-label='Project name'
                  disabled={rename.isPending}
                  required
                  onChange={event => {
                    if (rename.isError) rename.reset();
                    field.onChange(event);
                  }}
                />
              </FormControl>
              <FormMessage role='alert' />
            </FormItem>
          )}
        />
        {saveError && (
          <p role='alert' className='text-destructive text-sm'>
            {saveError}
          </p>
        )}
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={rename.isPending}
            onClick={() => {
              if (rename.isError) rename.reset();
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button type='submit' size='sm' disabled={!form.formState.isValid || rename.isPending}>
            {rename.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
