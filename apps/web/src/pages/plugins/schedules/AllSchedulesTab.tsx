import { Button } from '@owox/ui/components/button';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Input } from '@owox/ui/components/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, MoreHorizontal, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router';
import {
  runStatusLabel,
  usePluginSchedules,
  type ProjectPluginSchedule,
  type ScheduleOperation,
} from '../../../features/plugins';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog';
import { BaseTable, SortableHeader, ToggleColumnsHeader } from '../../../shared/components/Table';
import { UserReference } from '../../../shared/components/UserReference';
import { useBaseTable, useProjectRoute } from '../../../shared/hooks';
import { timezoneService } from '../../../services/timezone.service';
import { formatDateShort } from '../../../utils/date-formatters';
import { describeCron } from './describeCron';
import { FilterMenu } from './FilterMenu';
import { filterOptions, ownerLabel } from './filterOptions';
import { ScheduleSidePanel } from './ScheduleSidePanel';
import { ScheduleStatusBadge } from './ScheduleStatusBadge';
import {
  isScheduleStatus,
  SCHEDULE_STATUS_LABEL,
  SCHEDULE_STATUSES,
  scheduleStatus,
} from './scheduleStatus';
import { usePluginSchedulesParams } from './usePluginSchedulesParams';

const PAGE_SIZE = 15;

const GONE_TOAST_ID = 'plugin-schedule-gone';

// Only a run that went wrong or is still going spells out its status in the table.
const LAST_RUN_CLASS: Record<string, string> = {
  SUCCEEDED: 'sr-only',
  RUNNING: 'text-primary',
  FAILED: 'text-red-600 dark:text-red-400',
  TIMED_OUT: 'text-red-600 dark:text-red-400',
};

const titleOf = (schedule: ProjectPluginSchedule) => schedule.name ?? schedule.action;

// Links and the row menu sit inside a clickable row, which opens the side panel.
const keepRowClosed = (event: MouseEvent) => {
  event.stopPropagation();
};

/** Every schedule the caller can see; filters live in the URL, the search in the tab. */
export function AllSchedulesTab({ isAdmin }: { isAdmin: boolean }) {
  const {
    schedule: openId,
    plugin,
    statuses,
    owner: ownerParam,
    update,
    href,
  } = usePluginSchedulesParams();
  const { scope } = useProjectRoute();
  const { schedules, isPending, isFetching, isError, refetch, isChanging, change } =
    usePluginSchedules();
  // Cells read the latest values here, so the columns stay stable and cells are not remounted.
  const live = useRef({ href, scope, isChanging, change });
  live.current = { href, scope, isChanging, change };
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProjectPluginSchedule | null>(null);

  const status = statuses.find(isScheduleStatus) ?? null;
  const owner = isAdmin ? ownerParam : null;
  const query = search.trim().toLowerCase();

  const visible = useMemo(
    () =>
      schedules.filter(
        item =>
          (plugin === null || item.pluginId === plugin) &&
          (status === null || scheduleStatus(item) === status) &&
          (owner === null || item.owner?.userId === owner) &&
          (query === '' ||
            [item.name ?? '', item.action].some(text => text.toLowerCase().includes(query)))
      ),
    [schedules, plugin, status, owner, query]
  );

  const open = openId === null ? null : (schedules.find(item => item.id === openId) ?? null);
  // The current row, so a rename since the click shows; none once the schedule is gone.
  const deleting =
    deleteTarget === null ? null : (schedules.find(item => item.id === deleteTarget.id) ?? null);

  useEffect(() => {
    // Only a list read since the link can tell that a linked schedule is gone or hidden.
    if (openId !== null && !isPending && !isFetching && !isError && open === null) {
      toast.error('This schedule no longer exists.', { id: GONE_TOAST_ID });
      update({ schedule: null });
    }
  }, [openId, isPending, isFetching, isError, open, update]);

  const columns = useMemo<ColumnDef<ProjectPluginSchedule>[]>(
    () => [
      {
        id: 'name',
        accessorFn: titleOf,
        size: 160,
        meta: { title: 'Name' },
        header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
        cell: ({ row }) => (
          <button
            type='button'
            className='cursor-pointer text-left font-medium [overflow-wrap:anywhere] hover:underline'
            onClick={event => {
              event.stopPropagation();
              update({ schedule: row.original.id });
            }}
          >
            {titleOf(row.original)}
          </button>
        ),
      },
      {
        id: 'plugin',
        accessorFn: item => item.pluginName,
        size: 120,
        meta: { title: 'Plugin' },
        header: ({ column }) => <SortableHeader column={column}>Plugin</SortableHeader>,
        cell: ({ row }) => (
          <Link
            to={live.current.scope(`/plugins/${row.original.pluginId}`)}
            className='hover:underline'
            onClick={keepRowClosed}
          >
            {row.original.pluginName}
          </Link>
        ),
      },
      {
        id: 'action',
        accessorFn: item => item.action,
        size: 120,
        meta: { title: 'Action' },
        header: ({ column }) => <SortableHeader column={column}>Action</SortableHeader>,
        cell: ({ row }) => <code className='font-mono text-sm'>{row.original.action}</code>,
      },
      {
        id: 'schedule',
        accessorFn: item => item.cron,
        size: 180,
        enableSorting: false,
        meta: { title: 'Schedule' },
        header: () => 'Schedule',
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className='text-sm' tabIndex={0}>
                {describeCron(row.original.cron) ?? <code>{row.original.cron}</code>}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {timezoneService.getTimezoneDisplayName(row.original.timeZone)}
            </TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: 'status',
        accessorFn: item => SCHEDULE_STATUS_LABEL[scheduleStatus(item)],
        size: 120,
        meta: { title: 'Status' },
        header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
        cell: ({ row }) => <ScheduleStatusBadge schedule={row.original} />,
      },
      {
        id: 'nextRun',
        accessorFn: item => item.nextRunAt ?? undefined,
        sortingFn: 'basic',
        sortUndefined: 'last',
        size: 150,
        meta: { title: 'Next run' },
        header: ({ column }) => <SortableHeader column={column}>Next run</SortableHeader>,
        cell: ({ row }) =>
          row.original.nextRunAt ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className='text-muted-foreground text-sm' tabIndex={0}>
                  <RelativeTime date={new Date(row.original.nextRunAt)} />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {formatDateShort(row.original.nextRunAt, { timeZone: row.original.timeZone })}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className='text-muted-foreground text-sm'>—</span>
          ),
      },
      {
        id: 'lastRun',
        accessorFn: item => item.lastRun?.finishedAt ?? undefined,
        sortingFn: 'basic',
        sortUndefined: 'last',
        size: 150,
        meta: { title: 'Last run' },
        header: ({ column }) => <SortableHeader column={column}>Last run</SortableHeader>,
        cell: ({ row }) => {
          const { lastRun } = row.original;
          if (!lastRun) {
            return <span className='text-muted-foreground text-sm'>Never</span>;
          }
          return (
            <Link
              to={live.current.href('runs', {
                schedule: row.original.id,
                run: lastRun.executionId,
              })}
              className='text-sm hover:underline'
              onClick={keepRowClosed}
            >
              <span className={LAST_RUN_CLASS[lastRun.status] ?? 'text-muted-foreground'}>
                {runStatusLabel(lastRun.status)}
                {lastRun.finishedAt && ' · '}
              </span>
              {lastRun.finishedAt && <RelativeTime date={new Date(lastRun.finishedAt)} />}
            </Link>
          );
        },
      },
      ...(isAdmin
        ? [
            {
              id: 'owner',
              accessorFn: item =>
                item.owner ? ownerLabel(item.owner, item.owner.userId) : undefined,
              size: 120,
              meta: { title: 'Owner' },
              header: ({ column }) => <SortableHeader column={column}>Owner</SortableHeader>,
              cell: ({ row }) =>
                row.original.owner ? (
                  <UserReference userProjection={row.original.owner} />
                ) : (
                  <span className='text-muted-foreground'>—</span>
                ),
            } satisfies ColumnDef<ProjectPluginSchedule>,
          ]
        : []),
      {
        id: 'actions',
        size: 48,
        enableResizing: false,
        enableSorting: false,
        header: ({ table }) => <ToggleColumnsHeader table={table} />,
        cell: ({ row }) => (
          <ScheduleActions
            schedule={row.original}
            disabled={live.current.isChanging}
            runsHref={live.current.href('runs', { schedule: row.original.id })}
            pluginHref={live.current.scope(`/plugins/${row.original.pluginId}`)}
            onChange={operation => void live.current.change(operation, row.original.id)}
            onDelete={() => {
              setDeleteTarget(row.original);
            }}
          />
        ),
      },
    ],
    [isAdmin, update]
  );

  const { table } = useBaseTable<ProjectPluginSchedule>({
    data: visible,
    columns,
    storageKeyPrefix: 'project-plugin-schedules',
    defaultSortingColumn: 'nextRun',
    defaultSortingDesc: false,
    defaultPageSize: PAGE_SIZE,
    getRowId: item => item.id,
    // The poll replaces the list while a member reads a later page.
    keepPageOnDataChange: true,
  });

  if (isPending) {
    return <SkeletonList />;
  }
  if (isError && schedules.length === 0) {
    return (
      <div role='alert' className='flex flex-col items-start gap-2'>
        <p className='text-muted-foreground text-sm'>Schedules could not be loaded.</p>
        <Button
          variant='outline'
          onClick={() => {
            void refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (schedules.length === 0) {
    return (
      <div className='dm-empty-state'>
        <CalendarClock className='dm-empty-state-ico' strokeWidth={1} aria-hidden />
        <h2 className='dm-empty-state-title'>No schedules yet</h2>
        <p className='dm-empty-state-subtitle'>A plugin creates schedules from its own page.</p>
        <Button asChild variant='outline'>
          <Link to={scope('/plugins')}>Browse plugins</Link>
        </Button>
      </div>
    );
  }

  const filterBy = (changes: Parameters<typeof update>[0]) => {
    update(changes);
    table.setPageIndex(0);
  };
  const clearFilters = () => {
    setSearch('');
    filterBy({ plugin: null, status: null, owner: null });
  };
  const confirmDelete = async (target: ProjectPluginSchedule) => {
    // Closed first, or the refreshed list would make the open panel read as a gone schedule.
    if (openId === target.id) {
      update({ schedule: null });
    }
    const deleted = await change('delete', target.id);
    // Closed either way: a reopened panel would stack under a stale confirmation.
    setDeleteTarget(null);
    if (!deleted && openId === target.id) {
      update({ schedule: target.id });
    }
  };

  return (
    <>
      <BaseTable
        tableId='project-plugin-schedules-table'
        table={table}
        ariaLabel='Plugin schedules'
        paginationProps={{ displaySelected: false }}
        onRowClick={row => {
          update({ schedule: row.original.id });
        }}
        renderToolbarLeft={() => (
          <>
            <div className='relative max-w-xs min-w-0 flex-1'>
              <Search
                className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4'
                aria-hidden
              />
              <Input
                placeholder='Search by name or action'
                aria-label='Search schedules'
                value={search}
                onChange={event => {
                  setSearch(event.target.value);
                  table.setPageIndex(0);
                }}
                className='pl-8 text-sm'
              />
            </div>
            <FilterMenu
              label='Plugin'
              value={plugin}
              options={filterOptions(
                schedules.map(item => [item.pluginId, item.pluginName] as const),
                plugin,
                'Selected plugin'
              )}
              onChange={value => {
                filterBy({ plugin: value });
              }}
            />
            <FilterMenu
              label='Status'
              value={status}
              options={SCHEDULE_STATUSES.map(value => ({
                value,
                label: SCHEDULE_STATUS_LABEL[value],
              }))}
              onChange={value => {
                filterBy({ status: value });
              }}
            />
            {isAdmin && (
              <FilterMenu
                label='Owner'
                value={owner}
                options={filterOptions(
                  schedules.flatMap(item =>
                    item.owner
                      ? [[item.owner.userId, ownerLabel(item.owner, item.owner.userId)] as const]
                      : []
                  ),
                  owner,
                  'Selected owner'
                )}
                onChange={value => {
                  filterBy({ owner: value });
                }}
              />
            )}
          </>
        )}
        renderEmptyState={() => (
          <div className='flex flex-col items-center gap-2 py-8'>
            <p>No schedules match these filters</p>
            <Button variant='outline' size='sm' onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      />

      {open && (
        <ScheduleSidePanel
          schedule={open}
          disabled={isChanging}
          pluginHref={scope(`/plugins/${open.pluginId}`)}
          runsHref={href('runs', { schedule: open.id })}
          onClose={() => {
            update({ schedule: null });
          }}
          onChange={operation => void change(operation, open.id)}
          onDelete={() => {
            setDeleteTarget(open);
          }}
        />
      )}

      {deleting && (
        <ConfirmationDialog
          open
          onOpenChange={next => {
            if (!next && !isChanging) {
              setDeleteTarget(null);
            }
          }}
          title={`Delete ${titleOf(deleting)}?`}
          description='The plugin can create it again.'
          confirmLabel={isChanging ? 'Deleting…' : 'Delete'}
          cancelLabel='Cancel'
          confirmDisabled={isChanging}
          cancelDisabled={isChanging}
          showCloseButton={!isChanging}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  );
}

function ScheduleActions({
  schedule,
  disabled,
  runsHref,
  pluginHref,
  onChange,
  onDelete,
}: {
  schedule: ProjectPluginSchedule;
  disabled: boolean;
  runsHref: string;
  pluginHref: string;
  onChange: (operation: Exclude<ScheduleOperation, 'delete'>) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const removed = schedule.installationState === 'uninstalled';
  return (
    <div className='text-right' onClick={keepRowClosed}>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity focus-visible:opacity-100 ${menuOpen ? 'opacity-100' : 'group-hover:opacity-100'}`}
            aria-label={`Actions for ${titleOf(schedule)}`}
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {schedule.canManage && !removed && (
            <DropdownMenuItem
              disabled={disabled}
              onClick={() => {
                onChange(schedule.enabled ? 'pause' : 'resume');
              }}
            >
              {schedule.enabled ? 'Pause' : 'Resume'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link to={runsHref}>View runs</Link>
          </DropdownMenuItem>
          {!removed && (
            <DropdownMenuItem asChild>
              <Link to={pluginHref}>Open plugin</Link>
            </DropdownMenuItem>
          )}
          {schedule.canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={disabled} onClick={onDelete}>
                <span className='text-red-600'>Delete</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
