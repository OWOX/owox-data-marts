import { Button } from '@owox/ui/components/button';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { History, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  PLUGIN_RUN_STATUSES,
  PLUGIN_RUN_STATUS_LABEL,
  useCancelPluginRun,
  usePluginRun,
  usePluginRuns,
  usePluginSchedules,
  type PluginRun,
} from '../../../features/plugins';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog';
import { useProjectRoute } from '../../../shared/hooks';
import { FilterMenu, MultiFilterMenu } from './FilterMenu';
import { filterOptions, ownerLabel } from './filterOptions';
import { PluginRunRow } from './PluginRunRow';
import { runFiltersFrom, uuidOrNull } from './runFilters';
import { usePluginSchedulesParams } from './usePluginSchedulesParams';

const SOURCES = [
  { value: 'page', label: 'Plugin page' },
  { value: 'schedule', label: 'Schedule' },
];

const GONE_TOAST_ID = 'plugin-run-gone';

const STATUS_OPTIONS = PLUGIN_RUN_STATUSES.map(value => ({
  value,
  label: PLUGIN_RUN_STATUS_LABEL[value],
}));

/** Every run the caller can see, newest first; filters go to the API. */
export function RunHistoryTab({ isAdmin }: { isAdmin: boolean }) {
  const {
    statuses,
    source,
    plugin,
    schedule,
    owner,
    run: runId,
    update,
    href,
  } = usePluginSchedulesParams();
  const { scope } = useProjectRoute();
  const filters = runFiltersFrom({ statuses, source, plugin, schedule, owner }, isAdmin);
  const { runs, isPending, isError, hasMore, isLoadingMore, loadMore, retry } =
    usePluginRuns(filters);
  // Names for the filters and the schedule chip, for plugins and schedules no loaded run shows.
  const { schedules } = usePluginSchedules();
  const { cancel, isCancelling } = useCancelPluginRun();
  const [cancelling, setCancelling] = useState<PluginRun | null>(null);

  const listed = runId !== null && runs.some(item => item.id === runId);
  // Asked for only once the list has loaded without it, and only by a UUID, which goes into the request path.
  const unlisted =
    runId !== null && !isPending && !(isError && runs.length === 0) && !listed ? runId : null;
  const linked = usePluginRun(unlisted === null ? null : uuidOrNull(unlisted));
  const rows = linked && !listed && linked.id === runId ? [linked, ...runs] : runs;
  // Swept, hidden from this member or no run id at all: a dead link must not read as the whole list.
  const gone = unlisted !== null && (uuidOrNull(unlisted) === null || linked === null);

  useEffect(() => {
    if (gone) {
      toast.error('This run no longer exists.', { id: GONE_TOAST_ID });
      update({ run: null });
    }
  }, [gone, update]);

  const { statuses: chosen, ...narrowed } = filters;
  const filtered = chosen.length > 0 || Object.keys(narrowed).length > 0;

  const scheduleLabel = (id: string) => {
    const known = schedules.find(item => item.id === id);
    return known
      ? (known.name ?? known.action)
      : (runs.find(item => item.scheduleId === id)?.scheduleName ?? 'Selected schedule');
  };
  const confirmCancel = async (target: PluginRun) => {
    await cancel(target.id);
    setCancelling(null);
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <MultiFilterMenu
          label='Status'
          values={filters.statuses}
          options={STATUS_OPTIONS}
          onChange={values => {
            update({ status: values });
          }}
        />
        <FilterMenu
          label='Source'
          value={filters.trigger === undefined ? null : source}
          options={SOURCES}
          onChange={value => {
            update({ source: value });
          }}
        />
        <FilterMenu
          label='Plugin'
          value={filters.pluginId ?? null}
          options={filterOptions(
            [...runs, ...schedules].map(item => [item.pluginId, item.pluginName] as const),
            filters.pluginId ?? null,
            'Selected plugin'
          )}
          onChange={value => {
            update({ plugin: value });
          }}
        />
        {isAdmin && (
          <FilterMenu
            label='Owner'
            value={owner}
            options={filterOptions(
              [...runs, ...schedules].flatMap(item =>
                item.owner
                  ? [[item.owner.userId, ownerLabel(item.owner, item.owner.userId)] as const]
                  : []
              ),
              owner,
              'Selected owner'
            )}
            onChange={value => {
              update({ owner: value });
            }}
          />
        )}
        {filters.scheduleId !== undefined && (
          <span className='bg-muted inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm'>
            Schedule: {scheduleLabel(filters.scheduleId)}
            <Button
              variant='ghost'
              size='icon'
              className='size-5'
              aria-label='Remove schedule filter'
              onClick={() => {
                update({ schedule: null });
              }}
            >
              <X className='size-3' aria-hidden />
            </Button>
          </span>
        )}
      </div>

      {isPending ? (
        <SkeletonList />
      ) : isError && runs.length === 0 ? (
        <div role='alert' className='flex flex-col items-start gap-2'>
          <p className='text-muted-foreground text-sm'>Runs could not be loaded.</p>
          <Button variant='outline' onClick={retry}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className='dm-empty-state'>
          <History className='dm-empty-state-ico' strokeWidth={1} aria-hidden />
          {filtered ? (
            <>
              <h2 className='dm-empty-state-title'>No runs match these filters</h2>
              <Button
                variant='outline'
                onClick={() => {
                  update({ status: null, source: null, plugin: null, schedule: null, owner: null });
                }}
              >
                Clear filters
              </Button>
            </>
          ) : (
            <h2 className='dm-empty-state-title'>No runs yet</h2>
          )}
        </div>
      ) : (
        <ul className='flex flex-col gap-2' aria-label='Plugin runs'>
          {rows.map(item => (
            <PluginRunRow
              key={item.id}
              run={item}
              isAdmin={isAdmin}
              expanded={item.id === runId}
              linked={!listed && item.id === runId}
              pluginHref={scope(`/plugins/${item.pluginId}`)}
              scheduleHref={
                item.scheduleId !== null && item.scheduleName !== null
                  ? href('schedules', { schedule: item.scheduleId })
                  : null
              }
              onToggle={() => {
                update({ run: item.id === runId ? null : item.id });
              }}
              onCancel={() => {
                setCancelling(item);
              }}
            />
          ))}
        </ul>
      )}

      {hasMore && (
        <Button
          variant='outline'
          className='self-center'
          disabled={isLoadingMore}
          onClick={loadMore}
        >
          Load more
        </Button>
      )}

      <p className='text-muted-foreground text-xs'>
        Runs are kept for 90 days. Error messages are kept for 24 hours.
      </p>

      {cancelling && (
        <ConfirmationDialog
          open
          onOpenChange={next => {
            if (!next && !isCancelling) {
              setCancelling(null);
            }
          }}
          title='Cancel this run?'
          description='The run stops and is marked Cancelled.'
          confirmLabel='Cancel run'
          cancelLabel='Keep running'
          confirmDisabled={isCancelling}
          cancelDisabled={isCancelling}
          showCloseButton={!isCancelling}
          onConfirm={() => void confirmCancel(cancelling)}
        />
      )}
    </div>
  );
}
