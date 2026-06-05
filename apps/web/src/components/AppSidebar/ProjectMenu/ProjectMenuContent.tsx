import { useEffect } from 'react';
import { Link } from 'react-router';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@owox/ui/components/dropdown-menu';
import { ProjectSettingsSubmenu } from './ProjectSettingsSubmenu';
import { SwitchProjectMenu } from './SwitchProjectMenu';
import { useProjectMenu } from './useProjectMenu';
import { useProjectRoute } from '../../../shared/hooks';
import { useAuth } from '../../../features/idp';
import { useProjects } from '../../../features/idp/hooks/useProjects.ts';
import { RequestStatus } from '../../../shared/types/request-status.ts';

interface ProjectMenuContentProps {
  onClose: () => void;
  restricted?: boolean;
}

export function ProjectMenuContent({ onClose, restricted = false }: ProjectMenuContentProps) {
  if (restricted) {
    return <RestrictedProjectMenuContent />;
  }

  return <RegularProjectMenuContent onClose={onClose} />;
}

function RestrictedProjectMenuContent() {
  const { projects, loadProjects, callState, error, isLoading } = useProjects();
  const { user } = useAuth();

  useEffect(() => {
    if (callState === RequestStatus.IDLE) {
      void loadProjects();
    }
  }, [callState, loadProjects]);

  const switchableProjects = projects.filter(project => project.id !== user?.projectId);
  const shouldShowSwitchProject =
    callState === RequestStatus.IDLE ||
    isLoading ||
    error !== null ||
    switchableProjects.length > 0;

  return (
    <DropdownMenuContent align='start' side='right' className='w-56'>
      {shouldShowSwitchProject ? (
        <SwitchProjectMenu projectsOverride={switchableProjects} showSeparator={false} />
      ) : (
        <DropdownMenuItem disabled>No other projects available</DropdownMenuItem>
      )}
    </DropdownMenuContent>
  );
}

function RegularProjectMenuContent({ onClose }: { onClose: () => void }) {
  const { visibleMenuItems, canSwitchProject } = useProjectMenu();
  const { scope } = useProjectRoute();

  return (
    <DropdownMenuContent align='start' side='right' className='w-56'>
      {visibleMenuItems.map((item, index) => {
        if (item.type === 'separator') {
          return <DropdownMenuSeparator key={`separator-${String(index)}`} />;
        }

        if (item.type === 'project-settings-submenu') {
          return <ProjectSettingsSubmenu key='project-settings' onClose={onClose} />;
        }

        const Icon = item.icon;

        if (item.internal) {
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link to={scope(item.href)} className='flex items-center gap-2'>
                <Icon className='size-4' />
                {item.title}
              </Link>
            </DropdownMenuItem>
          );
        }

        return (
          <DropdownMenuItem key={item.href} asChild>
            <a
              href={item.href}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-2'
            >
              <Icon className='size-4' />
              {item.title}
            </a>
          </DropdownMenuItem>
        );
      })}
      {canSwitchProject && <SwitchProjectMenu key='switch-project' />}
    </DropdownMenuContent>
  );
}
