import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FolderOpen, MoreHorizontal, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@owox/ui/components/button';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import { refreshMemberAccessToken } from '../../app/api/apiClient';
import { getTokenProvider } from '../../app/api/token-provider';
import { useProjects } from '../idp/hooks/useProjects';
import { switchProject } from '../idp/services';
import type { Project } from '../idp/types';
import { getRoleDisplayName } from '../idp/utils/role-display-name';
import { useCloudProjectCreation } from '../project-settings/management/useCloudProjectCreation';
import {
  getProjectStatus,
  projectStatusLabels,
} from '../project-settings/management/project-status';
import { BaseTable, SortableHeader, TableColumnSearch } from '../../shared/components/Table';
import { StatusLabel } from '../../shared/components/StatusLabel';
import {
  applyFiltersToData,
  TableFilters,
  TableFiltersContent,
  TableFiltersTrigger,
  type FilterConfigItem,
} from '../../shared/components/TableFilters';
import { DEFAULT_FILTERS_STATE } from '../../shared/components/TableFilters/types';
import { useBaseTable } from '../../shared/hooks/useBaseTable';
import { RequestStatus } from '../../shared/types/request-status';
import { buildProjectPath, PROJECT_PLACEHOLDER } from '../../utils/path';
import { isValidProjectId } from '../idp/utils/project-id';
import { ProjectNameEditor } from '../project-settings/management/ProjectNameEditor';
import {
  getCloudProjectApiOrigin,
  isCurrentProjectSession,
  type ProjectManagementSession,
} from '../project-settings/management/project-management.service';
import { getProjectSettingsTabs } from '../project-settings/project-settings-tabs';

const filters: FilterConfigItem[] = [
  {
    id: 'roles',
    label: 'Role',
    dataType: 'enum',
    operators: ['eq', 'neq'],
    options: ['admin', 'editor', 'viewer'].map(role => ({
      value: role,
      label: getRoleDisplayName(role),
    })),
  },
  {
    id: 'status',
    label: 'Status',
    dataType: 'enum',
    operators: ['eq', 'neq'],
    options: Object.entries(projectStatusLabels)
      .filter(([value]) => value !== 'removed')
      .map(([value, status]) => ({ value, label: status.label })),
  },
];

const projectColumns: ColumnDef<Project>[] = [
  {
    header: ({ column }) => <SortableHeader column={column}>Project</SortableHeader>,
    accessorKey: 'title',
    size: 130,
    cell: ({ row }) => <span className='font-medium'>{row.original.title}</span>,
  },
  {
    header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
    id: 'status',
    accessorFn: getProjectStatus,
    size: 96,
    cell: ({ row }) => {
      const statusKey = getProjectStatus(row.original);
      const status = statusKey ? projectStatusLabels[statusKey] : undefined;
      return status ? <StatusLabel type={status.type}>{status.label}</StatusLabel> : '—';
    },
  },
  {
    header: ({ column }) => <SortableHeader column={column}>Role</SortableHeader>,
    id: 'roles',
    accessorFn: ({ roles }) => (roles?.length ? roles.map(getRoleDisplayName).join(', ') : '—'),
    size: 96,
  },
];

function isProjectLinkAvailable(project: Project): boolean {
  return (
    isValidProjectId(project.id) &&
    project.id !== PROJECT_PLACEHOLDER &&
    project.status !== 'removed' &&
    Boolean(project.roles?.length)
  );
}

function projectSettingsPath(project: Project, tab = '.') {
  return buildProjectPath(
    project.id,
    tab === '.' ? '/project-settings' : `/project-settings/${tab}`
  );
}

async function prepareProjectRename(session: ProjectManagementSession) {
  if (isCurrentProjectSession(session)) return;
  if (getTokenProvider()?.getUserId?.() !== session.userId) {
    throw new Error('The active account changed');
  }
  await switchProject(session.projectId, session.userId);
  await refreshMemberAccessToken();
}

function ProjectRowMenu({
  project,
  tabs,
}: {
  project: Project;
  tabs: ReturnType<typeof getProjectSettingsTabs>;
}) {
  return (
    <div className='text-right'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='dm-card-table-body-row-actionbtn'
            aria-label={`Project settings for ${project.title}`}
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' aria-hidden='true' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {tabs.map(({ name, path, icon: Icon }) => (
            <DropdownMenuItem asChild key={path}>
              <Link to={projectSettingsPath(project, path)}>
                <Icon aria-hidden='true' />
                {name}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AccountProjectsCard({
  flags,
  userId,
  viewOnly,
}: {
  flags: Record<string, unknown> | null;
  userId: string;
  viewOnly: boolean;
}) {
  const { projects, callState, loadProjects } = useProjects();
  const creation = useCloudProjectCreation();
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS_STATE);
  const visibleProjects = useMemo(
    () => projects.filter(project => project.status !== 'removed'),
    [projects]
  );

  useEffect(() => {
    if (callState === RequestStatus.IDLE) void loadProjects();
  }, [callState, loadProjects]);

  const data = useMemo(
    () =>
      applyFiltersToData(visibleProjects, appliedFilters, {
        roles: project => project.roles ?? [],
        status: getProjectStatus,
      }),
    [visibleProjects, appliedFilters]
  );
  const columns = useMemo<ColumnDef<Project>[]>(() => {
    if (flags?.IDP_PROVIDER !== 'owox-better-auth') return projectColumns;

    const tabs = getProjectSettingsTabs(flags);
    const renameOrigin = viewOnly ? null : getCloudProjectApiOrigin(flags);
    return [
      {
        ...projectColumns[0],
        cell: ({ row }) => {
          const project = row.original;
          if (!isProjectLinkAvailable(project))
            return <span className='font-medium'>{project.title}</span>;

          const projectPath = buildProjectPath(project.id, '/data-marts');
          if (renameOrigin && project.roles?.includes('admin') && !project.removalPending) {
            return (
              <ProjectNameEditor
                origin={renameOrigin}
                session={{ userId, projectId: project.id }}
                title={project.title}
                projectPath={projectPath}
                prepareSession={prepareProjectRename}
              />
            );
          }

          return (
            <Link
              className='font-medium break-words underline-offset-4 hover:underline'
              to={projectPath}
            >
              {project.title}
            </Link>
          );
        },
      },
      ...projectColumns.slice(1),
      {
        id: 'actions',
        size: 40,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className='sr-only'>Project actions</span>,
        cell: ({ row }) =>
          isProjectLinkAvailable(row.original) ? (
            <ProjectRowMenu project={row.original} tabs={tabs} />
          ) : null,
      },
    ];
  }, [flags, userId, viewOnly]);

  const { table } = useBaseTable({
    data,
    columns,
    storageKeyPrefix: 'account-projects',
    defaultSortingColumn: 'title',
    defaultSortingDesc: false,
    enableRowSelection: false,
    getRowId: project => project.id,
  });
  const createAction = creation.canCreate && (
    <Button
      variant='outline'
      disabled={creation.creating}
      onClick={() => void creation.createProject()}
    >
      <Plus className='size-4' aria-hidden='true' />
      {creation.label}
    </Button>
  );

  return (
    <section
      className='dm-card max-sm:[&_[data-slot=table-cell]]:pl-4 max-sm:[&_[data-slot=table-head]>button]:gap-1 max-sm:[&_[data-slot=table-head]>button]:px-2'
      aria-label='Projects'
    >
      {callState === RequestStatus.ERROR ? (
        <div role='alert' className='flex flex-wrap items-center gap-3 text-sm'>
          <p>Could not load your projects.</p>
          <Button size='sm' variant='outline' onClick={() => void loadProjects()}>
            Try again
          </Button>
          {creation.hasCreatedProject && createAction}
        </div>
      ) : callState === RequestStatus.LOADED ? (
        visibleProjects.length === 0 ? (
          <div className='dm-empty-state'>
            <FolderOpen className='dm-empty-state-ico' strokeWidth={1} aria-hidden='true' />
            <h2 className='dm-empty-state-title'>
              {creation.hasCreatedProject ? 'Project created' : 'No projects yet'}
            </h2>
            {createAction}
          </div>
        ) : (
          <BaseTable
            tableId='account-projects-table'
            table={table}
            ariaLabel='My projects'
            paginationProps={{ displaySelected: false }}
            renderToolbarLeft={() => (
              <>
                <TableFilters
                  appliedState={appliedFilters}
                  onApply={setAppliedFilters}
                  onClear={() => {
                    setAppliedFilters(DEFAULT_FILTERS_STATE);
                  }}
                >
                  <TableFiltersTrigger />
                  <TableFiltersContent config={filters} />
                </TableFilters>
                <TableColumnSearch table={table} columnId='title' placeholder='Search projects' />
                {creation.hasCreatedProject && createAction}
              </>
            )}
            renderEmptyState={() => <span role='status'>No projects found.</span>}
          />
        )
      ) : (
        <LoadingSpinner message='Loading projects...' />
      )}
    </section>
  );
}
