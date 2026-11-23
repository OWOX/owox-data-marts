import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { DropdownMenu, DropdownMenuItem } from '@owox/ui/components/dropdown-menu';
import { useFlags } from '../../../app/store/hooks';
import { useUser } from '../../../features/idp/hooks/useAuthState';
import { useProjects } from '../../../features/idp/hooks/useProjects';
import { signIn } from '../../../features/idp/services';
import {
  createCloudProject,
  registerCloudProject,
  getCloudProjectApiOrigin,
  isCurrentProjectSession,
} from '../../../features/project-settings/management/project-management.service';
import { buildProjectPath } from '../../../utils/path';
import { ProjectMenuTrigger } from './ProjectMenuTrigger';
import { ProjectMenuContent } from './ProjectMenuContent';

interface SidebarProjectMenuProps {
  restricted?: boolean;
}

export function SidebarProjectMenu({ restricted = false }: SidebarProjectMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { flags } = useFlags();
  const user = useUser();
  const origin = getCloudProjectApiOrigin(flags);
  const [createdProject, setCreatedProject] = useState<{
    sessionKey: string;
    id: string;
    registrationPending?: boolean;
  }>();
  const [creating, setCreating] = useState(false);
  const inFlight = useRef(false);
  const { loadProjects } = useProjects();
  const sessionKey = `${user?.id ?? ''}:${user?.projectId ?? ''}`;
  const lastProject = createdProject?.sessionKey === sessionKey ? createdProject : undefined;
  const createdId = lastProject?.id;
  const registrationPending = lastProject?.registrationPending === true;

  async function handleCreateProject() {
    if (!origin || !user?.id || !user.projectId || user.viewOnly || inFlight.current) return;
    const session = { userId: user.id, projectId: user.projectId };
    inFlight.current = true;
    setCreating(true);
    let targetId = createdId;
    try {
      if (!targetId || registrationPending) {
        const project = targetId
          ? await registerCloudProject(origin, session, targetId)
          : await createCloudProject(origin, session);
        if (!isCurrentProjectSession(session)) return;
        targetId = project.projectId;
        setCreatedProject({
          sessionKey,
          id: targetId,
          registrationPending: project.registrationPending,
        });
        void loadProjects({ force: true });
        if (project.registrationPending) {
          toast.error('Project created. Select Retry project setup to finish setting it up.');
          return;
        }
      }
      if (isCurrentProjectSession(session)) {
        signIn({ projectId: targetId, redirect: buildProjectPath(targetId, '/data-marts') });
      }
    } catch {
      if (isCurrentProjectSession(session)) {
        toast.error(
          registrationPending
            ? 'Could not finish project setup. Try again.'
            : targetId
              ? 'Project created. Select Open new project to try again.'
              : 'Could not create a project. Check your project list before trying again.'
        );
      }
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }

  return (
    <div data-slot='sidebar-header' data-sidebar='header' className='flex flex-col gap-2'>
      <ul
        data-slot='sidebar-menu'
        data-sidebar='menu'
        className='flex w-full min-w-0 flex-col gap-1'
      >
        <li
          data-slot='sidebar-menu-item'
          data-sidebar='menu-item'
          className='group/menu-item relative'
        >
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <ProjectMenuTrigger isOpen={isOpen} />
            <ProjectMenuContent
              restricted={restricted}
              onClose={() => {
                setIsOpen(false);
              }}
              createProjectItem={
                origin && user?.id && user.projectId && !user.viewOnly ? (
                  <DropdownMenuItem
                    disabled={creating}
                    onSelect={event => {
                      event.preventDefault();
                      void handleCreateProject();
                    }}
                  >
                    <Plus className='size-4' aria-hidden='true' />
                    {creating
                      ? 'Setting up project…'
                      : registrationPending
                        ? 'Retry project setup'
                        : createdId
                          ? 'Open new project'
                          : 'Create project'}
                  </DropdownMenuItem>
                ) : undefined
              }
            />
          </DropdownMenu>
        </li>
      </ul>
    </div>
  );
}
