import { Button } from '@owox/ui/components/button';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import { Combobox } from '../../../shared/components/Combobox/combobox';
import { RequestStatus } from '../../../shared/types/request-status';
import { buildProjectPath } from '../../../utils/path';
import { useProjects } from '../../idp/hooks/useProjects';
import { signIn } from '../../idp/services';

const projectTitleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function ProjectDeleted({ projectId }: { projectId: string }) {
  const { projects, callState, loadProjects } = useProjects();
  const available = projects.filter(
    project =>
      project.id !== projectId &&
      project.status === 'active' &&
      !project.removalPending &&
      project.roles?.length
  );

  function openProject(id: string) {
    signIn({ projectId: id, redirect: buildProjectPath(id, '/data-marts') });
  }

  return (
    <section className='dm-card flex flex-col items-start gap-3'>
      <h2 className='text-base font-medium'>Project deleted</h2>
      {callState === RequestStatus.LOADING || callState === RequestStatus.IDLE ? (
        <LoadingSpinner message='Loading projects…' />
      ) : callState === RequestStatus.ERROR ? (
        <>
          <p className='text-muted-foreground text-sm'>Could not load your other projects.</p>
          <Button variant='outline' onClick={() => void loadProjects({ force: true })}>
            Try again
          </Button>
          <Button
            onClick={() => {
              signIn({ redirect: '/' });
            }}
          >
            Continue
          </Button>
        </>
      ) : available.length > 0 ? (
        <>
          <p className='text-muted-foreground text-sm'>Choose a project to continue.</p>
          {available.length > 10 ? (
            <Combobox
              ariaLabel='Select a project'
              placeholder='Select a project'
              emptyMessage='No projects found.'
              className='max-w-sm'
              options={available
                .sort((first, second) => projectTitleCollator.compare(first.title, second.title))
                .map(project => ({ value: project.id, label: project.title }))}
              value=''
              onValueChange={openProject}
            />
          ) : (
            <ul className='flex flex-col gap-2'>
              {available.map(project => (
                <li key={project.id}>
                  <Button
                    variant='outline'
                    onClick={() => {
                      openProject(project.id);
                    }}
                  >
                    {project.title}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className='text-muted-foreground text-sm'>You have no other available projects.</p>
          <Button
            onClick={() => {
              signIn({ redirect: '/' });
            }}
          >
            Continue
          </Button>
        </>
      )}
    </section>
  );
}
