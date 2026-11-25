import { useState } from 'react';
import { matchPath, useLocation } from 'react-router';
import { Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem } from '@owox/ui/components/dropdown-menu';
import { useCloudProjectCreation } from '../../../features/project-settings/management/useCloudProjectCreation';
import { getMcpIntegration } from '../../../features/user-provisioning/utils/mcp-request-access';
import { ProjectMenuTrigger } from './ProjectMenuTrigger';
import { ProjectMenuContent } from './ProjectMenuContent';

interface SidebarProjectMenuProps {
  restricted?: boolean;
}

export function SidebarProjectMenu({ restricted = false }: SidebarProjectMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { canCreate, creating, label, createProject } = useCloudProjectCreation();
  const { pathname, search } = useLocation();
  const mcpRequestAccess =
    matchPath('/ui/:projectId/request-access', pathname) && getMcpIntegration(search);

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
                canCreate && !mcpRequestAccess ? (
                  <DropdownMenuItem
                    disabled={creating}
                    onSelect={event => {
                      event.preventDefault();
                      void createProject();
                    }}
                  >
                    <Plus className='size-4' aria-hidden='true' />
                    {label}
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
