import { useEffect } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from '@owox/ui/components/dropdown-menu';
import { Check } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../../features/idp';
import { useProjects } from '../../../features/idp/hooks/useProjects.ts';
import { RequestStatus } from '../../../shared/types/request-status.ts';
import { buildProjectPath } from '../../../utils/path.ts';

interface SwitchProjectMenuProps {
  autoLoad?: boolean;
  emptyMessage?: string;
  excludeCurrentProject?: boolean;
  showSeparator?: boolean;
}

function SwitchProjectMenuInner({
  autoLoad = false,
  emptyMessage,
  excludeCurrentProject = false,
  showSeparator = true,
}: SwitchProjectMenuProps) {
  const { projects, loadProjects, callState, error, isLoading } = useProjects();
  const { user } = useAuth();
  const visibleProjects = excludeCurrentProject
    ? projects.filter(project => project.id !== user?.projectId)
    : projects;
  const isInitialLoad = autoLoad && callState === RequestStatus.IDLE;

  useEffect(() => {
    if (isInitialLoad) {
      void loadProjects();
    }
  }, [isInitialLoad, loadProjects]);

  return (
    <DropdownMenuSub>
      {showSeparator && <DropdownMenuSeparator />}
      <DropdownMenuSubTrigger className='flex items-center gap-2'>
        <ArrowRightLeft className='h-4 w-4' />
        Switch project
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          {(isLoading || isInitialLoad) && (
            <DropdownMenuItem disabled>
              <span className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' /> Loading projects...
              </span>
            </DropdownMenuItem>
          )}
          {!isLoading && error && (
            <>
              <DropdownMenuItem disabled>
                Unable to load projects. Please try again.
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void loadProjects()}>Retry</DropdownMenuItem>
            </>
          )}
          {!isLoading &&
            !isInitialLoad &&
            !error &&
            visibleProjects.length === 0 &&
            emptyMessage && <DropdownMenuItem disabled>{emptyMessage}</DropdownMenuItem>}
          {!isLoading &&
            !isInitialLoad &&
            !error &&
            visibleProjects.map(project => {
              const isCurrent = project.id === user?.projectId;
              return (
                <DropdownMenuItem asChild key={project.id}>
                  <NavLink
                    to={buildProjectPath(encodeURIComponent(project.id), '/')}
                    className='flex items-center gap-2'
                  >
                    {isCurrent ? <Check className='h-4 w-4' /> : <span className='h-4 w-4' />}
                    {project.title}
                  </NavLink>
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

export function SwitchProjectMenu({
  autoLoad = false,
  emptyMessage,
  excludeCurrentProject = false,
  showSeparator = true,
}: SwitchProjectMenuProps) {
  return (
    <SwitchProjectMenuInner
      autoLoad={autoLoad}
      emptyMessage={emptyMessage}
      excludeCurrentProject={excludeCurrentProject}
      showSeparator={showSeparator}
    />
  );
}
