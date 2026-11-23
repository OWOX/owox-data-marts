import { Button } from '@owox/ui/components/button';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import { RequestStatus } from '../../../shared/types/request-status';
import { buildProjectPath } from '../../../utils/path';
import { useProjects } from '../../idp/hooks/useProjects';
import { signIn } from '../../idp/services';

export function ProjectDeleted({ projectId }: { projectId: string }) {
  const { projects, callState, loadProjects } = useProjects();
  const available = projects.filter(
    project =>
      project.id !== projectId &&
      project.status === 'active' &&
      !project.removalPending &&
      project.roles?.length
  );

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
          <ul className='flex flex-col gap-2'>
            {available.map(project => (
              <li key={project.id}>
                <Button
                  variant='outline'
                  onClick={() => {
                    signIn({
                      projectId: project.id,
                      redirect: buildProjectPath(project.id, '/data-marts'),
                    });
                  }}
                >
                  {project.title}
                </Button>
              </li>
            ))}
          </ul>
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
