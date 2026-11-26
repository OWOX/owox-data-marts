import { Link } from 'react-router';
import type { ReactNode } from 'react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@owox/ui/components/dropdown-menu';
import { ProjectSettingsSubmenu } from './ProjectSettingsSubmenu';
import { SwitchProjectMenu } from './SwitchProjectMenu';
import { useProjectMenu } from './useProjectMenu';
import { useProjectRoute } from '../../../shared/hooks';

interface ProjectMenuContentProps {
  onClose?: () => void;
  restricted?: boolean;
  createProjectItem?: ReactNode;
}

export function ProjectMenuContent({
  onClose,
  restricted = false,
  createProjectItem,
}: ProjectMenuContentProps) {
  if (restricted) {
    return <RestrictedProjectMenuContent createProjectItem={createProjectItem} />;
  }

  return (
    <RegularProjectMenuContent
      onClose={onClose ?? ignoreMenuClose}
      createProjectItem={createProjectItem}
    />
  );
}

function RestrictedProjectMenuContent({ createProjectItem }: { createProjectItem?: ReactNode }) {
  return (
    <DropdownMenuContent align='start' side='right' className='w-56'>
      <SwitchProjectMenu
        autoLoad
        emptyMessage='No other projects available'
        excludeCurrentProject
        showSeparator={false}
      />
      {createProjectItem}
    </DropdownMenuContent>
  );
}

const ignoreMenuClose = () => undefined;

function RegularProjectMenuContent({
  onClose,
  createProjectItem,
}: {
  onClose: () => void;
  createProjectItem?: ReactNode;
}) {
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
      {createProjectItem}
    </DropdownMenuContent>
  );
}
