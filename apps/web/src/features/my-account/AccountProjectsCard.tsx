import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@owox/ui/components/button';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import { useProjects } from '../idp/hooks/useProjects';
import type { Project } from '../idp/types';
import { getRoleDisplayName } from '../idp/utils/role-display-name';
import { BaseTable, SortableHeader, TableColumnSearch } from '../../shared/components/Table';
import { StatusLabel, StatusTypeEnum } from '../../shared/components/StatusLabel';
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

const statuses = {
  active: { label: 'Active', type: StatusTypeEnum.SUCCESS },
  blocked: { label: 'Blocked', type: StatusTypeEnum.ERROR },
  removed: { label: 'Removed', type: StatusTypeEnum.NEUTRAL },
};

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
    options: Object.entries(statuses).map(([value, status]) => ({ value, label: status.label })),
  },
];

const columns: ColumnDef<Project>[] = [
  {
    header: ({ column }) => <SortableHeader column={column}>Project</SortableHeader>,
    accessorKey: 'title',
    size: 130,
    cell: ({ row }) => <span className='font-medium'>{row.original.title}</span>,
  },
  {
    header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
    accessorKey: 'status',
    size: 96,
    cell: ({ row }) => {
      const status = row.original.status ? statuses[row.original.status] : undefined;
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

export function AccountProjectsCard() {
  const { projects, callState, loadProjects } = useProjects();
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS_STATE);

  useEffect(() => {
    if (callState === RequestStatus.IDLE) void loadProjects();
  }, [callState, loadProjects]);

  const data = useMemo(
    () =>
      applyFiltersToData(projects, appliedFilters, {
        roles: project => project.roles ?? [],
        status: project => project.status,
      }),
    [projects, appliedFilters]
  );
  const { table } = useBaseTable({
    data,
    columns,
    storageKeyPrefix: 'account-projects',
    defaultSortingColumn: 'title',
    defaultSortingDesc: false,
    enableRowSelection: false,
    getRowId: project => project.id,
  });

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
        </div>
      ) : callState === RequestStatus.LOADED ? (
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
            </>
          )}
          renderEmptyState={() => (
            <span role='status'>
              {projects.length === 0
                ? 'You have no project memberships yet.'
                : 'No projects found.'}
            </span>
          )}
        />
      ) : (
        <LoadingSpinner message='Loading projects...' />
      )}
    </section>
  );
}
