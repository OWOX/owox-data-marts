import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { TablePagination } from '@owox/ui/components/common/table-pagination';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { BaseTable, TableColumnSearch } from '../../shared/components/Table';
import {
  applyFiltersToData,
  TableFilters,
  TableFiltersContent,
  TableFiltersTrigger,
  type FilterConfigItem,
} from '../../shared/components/TableFilters';
import { collectOptionsFromData } from '../../shared/components/TableFilters/collectOptions.utils';
import { DEFAULT_FILTERS_STATE } from '../../shared/components/TableFilters/types';
import { useUser } from '../idp/hooks/useAuthState';
import { usePluginGallery } from '../plugins/hooks/usePlugins';
import { repositoryPath } from '../plugins/repository';
import {
  consumptionEntityPath,
  flattenConsumptionBranches,
  groupConsumption,
  licenseKeyLabel,
  originatingProjectLabel,
  parseDeploymentUrl,
  type ConsumptionPluginIds,
} from './consumption-groups';
import {
  consumptionColumnTitle,
  consumptionOperationTitle,
  googleSheetsConsumptionUrl,
  resolveConsumptionLabel,
} from './consumption-labels';
import type { ConsumptionBranch, ConsumptionProduct, ConsumptionUnit } from './cloud-billing';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
type DetailRow = ConsumptionBranch & {
  entities: Map<string, ReturnType<typeof resolveConsumptionLabel>>;
};

const column = createColumnHelper<DetailRow>();
const pageSizes = [10, 25, 50];
const linkClass = 'text-primary hover:underline';

function DetailTable({
  branches,
  projections,
  projectId,
  pluginIds,
  deployment,
  title,
}: {
  branches: ConsumptionBranch[];
  projections: ConsumptionProduct['entityProjections'];
  projectId: string | undefined;
  pluginIds: ConsumptionPluginIds;
  deployment: URL | null;
  title: string;
}) {
  const tableId = useId();
  const [filters, setFilters] = useState(DEFAULT_FILTERS_STATE);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const rows = useMemo(
    () =>
      flattenConsumptionBranches(branches)
        .sort((a, b) => b.consumption - a.consumption)
        .map(row => ({
          ...row,
          entities: new Map(
            Object.entries(row.labels)
              .filter(([label]) => label !== licenseKeyLabel && label !== originatingProjectLabel)
              .map(([label, id]) => [
                label,
                resolveConsumptionLabel(label, id, row.labels, projections),
              ])
          ),
        })),
    [branches, projections]
  );
  const labels = useMemo(() => [...new Set(rows.flatMap(row => [...row.entities.keys()]))], [rows]);
  const filterAccessors = useMemo(
    () =>
      Object.fromEntries(
        labels.map(label => [label, (row: DetailRow) => row.entities.get(label)?.title ?? ''])
      ),
    [labels]
  );
  const filterConfig = useMemo<FilterConfigItem[]>(
    () =>
      labels.map(label => ({
        id: label,
        label: consumptionColumnTitle(label),
        dataType: 'string',
        operators: ['eq', 'neq', 'contains', 'not_contains'],
        options: collectOptionsFromData(rows, filterAccessors[label]),
      })),
    [labels, rows, filterAccessors]
  );
  const filteredRows = useMemo(
    () =>
      applyFiltersToData(
        rows,
        {
          ...filters,
          filters: filters.filters.filter(filter => labels.includes(filter.fieldId)),
        },
        filterAccessors
      ),
    [rows, filters, filterAccessors, labels]
  );
  const columns = useMemo(() => {
    return [
      column.accessor(
        row =>
          [...row.entities]
            .map(([label, entity]) => `${entity.title} ${row.labels[label]}`)
            .join(' '),
        { id: 'search', filterFn: 'includesString' }
      ),
      ...labels.map(label =>
        column.display({
          id: label,
          header: consumptionColumnTitle(label),
          cell: ({ row }) => {
            const labels = row.original.labels;
            const id = labels[label];
            const entity = row.original.entities.get(label);
            if (!id || !entity) return '—';
            const { title, isDeleted } = entity;
            if (isDeleted) return title;
            const sheetsUrl = googleSheetsConsumptionUrl(label, labels);
            if (sheetsUrl) {
              return (
                <ExternalAnchor href={sheetsUrl} className='max-w-full'>
                  {title}
                </ExternalAnchor>
              );
            }
            const licensed = Boolean(labels[licenseKeyLabel] || labels[originatingProjectLabel]);
            const destination = licensed
              ? deployment && labels[originatingProjectLabel]
              : projectId;
            const path = destination
              ? consumptionEntityPath(
                  destination,
                  labels,
                  label,
                  id,
                  licensed ? {} : pluginIds,
                  entity.parentTransformationId
                )
              : null;
            if (!path) return title;
            if (licensed && deployment) {
              return (
                <ExternalAnchor href={new URL(path, deployment).href} className='max-w-full'>
                  {title}
                </ExternalAnchor>
              );
            }
            return (
              <Link to={path} className={`block truncate ${linkClass}`}>
                {title}
              </Link>
            );
          },
        })
      ),
      column.accessor('consumption', {
        header: () => <div className='pr-4 text-right'>Usage</div>,
        cell: ({ getValue }) => (
          <div className='pr-4 text-right tabular-nums'>{number.format(getValue())}</div>
        ),
        size: 100,
      }),
    ];
  }, [deployment, projectId, pluginIds, labels]);
  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { columnFilters },
    onColumnFiltersChange: updater => {
      setColumnFilters(updater);
      table.setPageIndex(0);
    },
    initialState: {
      columnVisibility: { search: false },
      pagination: { pageSize: pageSizes[0], pageIndex: 0 },
    },
    enableColumnResizing: false,
  });

  return (
    <div className='min-w-0 space-y-2 overflow-x-auto'>
      <BaseTable
        tableId={tableId}
        table={table}
        ariaLabel={title}
        showPagination={false}
        renderEmptyState={() => (
          <div className='py-4'>No details match your search and filters.</div>
        )}
        renderToolbarLeft={() => (
          <>
            {filterConfig.length > 0 && (
              <TableFilters
                appliedState={filters}
                onApply={state => {
                  setFilters(state);
                  table.setPageIndex(0);
                }}
                onClear={() => {
                  setFilters(DEFAULT_FILTERS_STATE);
                  table.setPageIndex(0);
                }}
              >
                <TableFiltersTrigger />
                <TableFiltersContent config={filterConfig} />
              </TableFilters>
            )}
            <TableColumnSearch table={table} columnId='search' placeholder='Search details' />
          </>
        )}
      />
      {rows.length > pageSizes[0] && (
        <TablePagination table={table} displaySelected={false} pageSizeOptions={pageSizes} />
      )}
    </div>
  );
}

export function ConsumptionDetails({
  product,
  unit,
}: {
  product: ConsumptionProduct;
  unit: ConsumptionUnit;
}) {
  const projectId = useUser()?.projectId;
  const { plugins } = usePluginGallery();
  // Repository redirects resolve deployment publications only. The gallery also includes
  // project/member publications and installed plugins, so link to their actual IDs.
  const pluginIds = useMemo<ConsumptionPluginIds>(() => {
    const findPluginId = (repository: string) =>
      plugins.find(
        plugin =>
          plugin.source.repositoryUrl &&
          repositoryPath(plugin.source.repositoryUrl).toLowerCase() === repository
      )?.pluginId;
    return {
      streaming: findPluginId('owox/streaming-plugin'),
      transformations: findPluginId('owox/transformations-plugin'),
    };
  }, [plugins]);
  const title = `${consumptionOperationTitle(unit.unit)} details`;
  const groups = groupConsumption({ ...product, units: [unit] });

  if (!unit.decomposition?.length) return null;

  if (groups.length === 0) {
    return (
      <DetailTable
        branches={unit.decomposition}
        projections={product.entityProjections}
        projectId={projectId}
        pluginIds={pluginIds}
        deployment={null}
        title={title}
      />
    );
  }

  return (
    <div className='space-y-4'>
      {groups.map(group => {
        const deployment = parseDeploymentUrl(group.origin);
        const operation = group.operations[0];
        return (
          <section key={group.key} aria-label={group.title} className='space-y-2'>
            <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
              <p className='text-sm font-medium'>{group.title}</p>
              <span className='text-muted-foreground text-sm'>
                {number.format(operation.units)} units · {number.format(operation.credits)} credits
              </span>
              {deployment && (
                <ExternalAnchor href={deployment.href}>{deployment.host}</ExternalAnchor>
              )}
            </div>
            <DetailTable
              branches={operation.branches}
              projections={product.entityProjections}
              projectId={projectId}
              pluginIds={pluginIds}
              deployment={deployment}
              title={`${title} — ${group.title}`}
            />
          </section>
        );
      })}
    </div>
  );
}
