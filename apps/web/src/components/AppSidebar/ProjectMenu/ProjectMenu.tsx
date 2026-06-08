import { useState } from 'react';
import { DropdownMenu } from '@owox/ui/components/dropdown-menu';
import { ProjectMenuTrigger } from './ProjectMenuTrigger';
import { ProjectMenuContent } from './ProjectMenuContent';
import { ProjectsProvider } from '../../../features/idp/context/ProjectsContext.tsx';

interface SidebarProjectMenuProps {
  restricted?: boolean;
}

export function SidebarProjectMenu({ restricted = false }: SidebarProjectMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

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
            <ProjectsProvider>
              <ProjectMenuContent
                restricted={restricted}
                onClose={() => {
                  setIsOpen(false);
                }}
              />
            </ProjectsProvider>
          </DropdownMenu>
        </li>
      </ul>
    </div>
  );
}
