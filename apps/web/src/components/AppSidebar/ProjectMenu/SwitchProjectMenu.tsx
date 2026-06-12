import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ArrowRightLeft, Check, Loader2 } from 'lucide-react';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from '@owox/ui/components/dropdown-menu';
import { NavLink, useNavigate } from 'react-router-dom';
import { Input } from '@owox/ui/components/input';
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
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const visibleProjects = excludeCurrentProject
    ? projects.filter(project => project.id !== user?.projectId)
    : projects;
  const isInitialLoad = autoLoad && callState === RequestStatus.IDLE;

  useEffect(() => {
    if (isInitialLoad) {
      void loadProjects();
    }
  }, [isInitialLoad, loadProjects]);

  const showSearch = projects.length > 10;

  const filteredProjects = useMemo(() => {
    if (!showSearch || !searchQuery.trim()) {
      return visibleProjects;
    }
    const query = searchQuery.toLowerCase().trim();
    return visibleProjects.filter(project => project.title.toLowerCase().includes(query));
  }, [visibleProjects, searchQuery, showSearch]);

  // Reset active index when filtered list changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [filteredProjects]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!filteredProjects.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(prev => (prev + 1) % filteredProjects.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(prev => (prev <= 0 ? filteredProjects.length - 1 : prev - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const project = filteredProjects[activeIndex];
        void navigate(buildProjectPath(encodeURIComponent(project.id), '/'));
      }
    },
    [filteredProjects, activeIndex, navigate]
  );

  return (
    <DropdownMenuSub>
      {showSeparator && <DropdownMenuSeparator />}
      <DropdownMenuSubTrigger className='flex items-center gap-2'>
        <ArrowRightLeft className='h-4 w-4' />
        Switch project
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          className='flex w-64 flex-col overflow-hidden p-0'
          onKeyDown={showSearch ? undefined : handleKeyDown}
        >
          {showSearch && (
            <div
              className='bg-popover sticky top-0 z-10 shrink-0 border-b px-2 py-1.5'
              onClick={e => {
                e.stopPropagation();
              }}
              onPointerDown={e => {
                e.stopPropagation();
              }}
            >
              <Input
                type='text'
                placeholder='Search project...'
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setActiveIndex(-1);
                }}
                onKeyDown={e => {
                  // Let arrow keys / Enter propagate for list navigation
                  if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
                    handleKeyDown(e);
                  } else {
                    e.stopPropagation();
                  }
                }}
                className='h-8 text-xs'
                autoFocus
              />
            </div>
          )}

          <div
            ref={listRef}
            data-testid='project-list'
            className='max-h-[400px] overflow-y-auto py-1'
            onKeyDown={!showSearch ? handleKeyDown : undefined}
          >
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
              filteredProjects.length === 0 &&
              (searchQuery.trim() ? (
                <DropdownMenuItem disabled>No projects found</DropdownMenuItem>
              ) : (
                visibleProjects.length === 0 &&
                emptyMessage && <DropdownMenuItem disabled>{emptyMessage}</DropdownMenuItem>
              ))}
            {!isLoading &&
              !isInitialLoad &&
              !error &&
              filteredProjects.map((project, index) => {
                const isCurrent = project.id === user?.projectId;
                const isActive = index === activeIndex;
                return (
                  <DropdownMenuItem
                    asChild
                    key={project.id}
                    className={isActive ? 'bg-accent text-accent-foreground' : ''}
                    onPointerEnter={() => {
                      setActiveIndex(index);
                    }}
                    onPointerLeave={() => {
                      setActiveIndex(-1);
                    }}
                  >
                    <NavLink
                      to={buildProjectPath(encodeURIComponent(project.id), '/')}
                      className='flex w-full min-w-0 items-center gap-2'
                      title={project.title}
                    >
                      {isCurrent ? (
                        <Check className='h-4 w-4 shrink-0' />
                      ) : (
                        <span className='h-4 w-4 shrink-0' />
                      )}
                      <span className='truncate'>{project.title}</span>
                    </NavLink>
                  </DropdownMenuItem>
                );
              })}
          </div>
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
