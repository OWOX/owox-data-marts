import { useId, useState } from 'react';
import { CalendarDays, Gem } from 'lucide-react';
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@owox/ui/components/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { BaseTable } from '../../shared/components/Table/BaseTable';
import { BillingLoadState } from './BillingLoadState';
import {
  useCloudBillingQuery,
  type ConsumptionBranch,
  type ConsumptionProduct,
  type ConsumptionProjection,
  type ConsumptionSummary,
  type ConsumptionUnit,
  type CreditBalance,
} from './cloud-billing';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

function getMonths(now: Date) {
  const result: Date[] = [];
  for (
    let month = new Date(now.getFullYear(), now.getMonth(), 1);
    month.getFullYear() >= 2023;
    month = new Date(month.getFullYear(), month.getMonth() - 1, 1)
  ) {
    result.push(month);
  }
  return result;
}

function readableName(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const column = createColumnHelper<ConsumptionUnit>();
const numericColumns = [
  { key: 'consumption', label: 'Usage' },
  { key: 'roundedConsumption', label: 'Billable units' },
  { key: 'consumptionUnitPrice', label: 'Credits per unit' },
  { key: 'credits', label: 'Credits' },
] as const;
const consumptionColumns = [
  column.accessor('unit', {
    header: 'Operation',
    cell: ({ getValue }) => readableName(getValue()),
    size: 220,
  }),
  ...numericColumns.map(({ key, label }) =>
    column.accessor(key, {
      header: () => <div className='pr-4 text-right'>{label}</div>,
      cell: ({ getValue }) => (
        <div className='pr-4 text-right tabular-nums'>{number.format(getValue())}</div>
      ),
      size: 110,
    })
  ),
];

function ConsumptionTable({ product }: { product: ConsumptionProduct }) {
  const tableId = useId();
  const table = useReactTable({
    columns: consumptionColumns,
    data: product.units,
    getRowId: unit => unit.unit,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: false,
  });

  return (
    <div className='dm-card overflow-x-auto'>
      <div className='min-w-xl'>
        <BaseTable
          tableId={tableId}
          table={table}
          ariaLabel={`${readableName(product.product)} consumption`}
          showPagination={false}
        />
      </div>
    </div>
  );
}

function resolveLabel(
  name: string,
  value: string,
  labels: Record<string, string>,
  projections: ConsumptionProduct['entityProjections']
) {
  const type = name.replace(/ ID$/, '').replace(/ /g, '_');
  const candidates =
    type === 'LICENSE'
      ? projections?.SELF_MANAGED_LICENSE
      : type === 'CONTEXT'
        ? projections?.[labels['CONTEXT TYPE']]
        : (projections?.[type] ??
          (type === 'DATA_MART' ? projections?.SMART_DATA_DATA_MART : null));
  const find = (
    items: ConsumptionProjection[] | null | undefined
  ): ConsumptionProjection | undefined => {
    for (const item of items ?? []) {
      if (item.id === value) return item;
      const child = find(item.childEntities);
      if (child) return child;
    }
  };
  if (type === 'GOOGLE_SHEETS_DOCUMENT_LIST') {
    const doc = projections?.GOOGLE_SHEETS_DOCUMENT?.find(
      item => item.id === labels['GOOGLE SHEETS DOCUMENT']
    );
    return find(doc?.childEntities);
  }
  if (type === 'TRANSFORMATION_OPERATION') {
    const transformation = projections?.TRANSFORMATION?.find(
      item => item.id === labels['TRANSFORMATION ID']
    );
    return find(transformation?.childEntities);
  }
  return find(candidates);
}

function Breakdown({
  branches,
  projections,
}: {
  branches: ConsumptionBranch[];
  projections: ConsumptionProduct['entityProjections'];
}) {
  return (
    <ul className='border-border space-y-2 border-l pl-3 text-sm'>
      {branches.map(branch => (
        <li key={JSON.stringify(branch.labels)} className='space-y-2'>
          <div className='flex justify-between gap-4'>
            <dl className='min-w-0 space-y-1'>
              {Object.entries(branch.labels).map(([label, id]) => {
                const entity = resolveLabel(label, id, branch.labels, projections);
                return (
                  <div key={label} className='flex flex-wrap gap-x-2 break-all'>
                    <dt className='text-muted-foreground'>{readableName(label)}</dt>
                    <dd>
                      {entity?.title ?? id}
                      {entity?.origin ? ` (${entity.origin})` : ''}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <span className='tabular-nums'>{number.format(branch.consumption)}</span>
          </div>
          {!!branch.childBranches?.length && (
            <Breakdown branches={branch.childBranches} projections={projections} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function CreditConsumption({ origin }: { origin: string }) {
  const [months] = useState(() => getMonths(new Date()));
  const [selected, setSelected] = useState('0');
  const month = months[Number(selected)];
  const balance = useCloudBillingQuery<CreditBalance | null>(origin, '/api/bi-projects/balance');
  const summary = useCloudBillingQuery<ConsumptionSummary>(
    origin,
    '/api/consumption/project-summary',
    {
      year: month.getFullYear(),
      month: month.getMonth() + 1,
    }
  );
  const updated = summary.data?.products
    .flatMap(product => product.units.map(unit => unit.updated))
    .reduce<
      string | undefined
    >((latest, value) => (!latest || value > latest ? value : latest), undefined);

  return (
    <div className='dm-page-content flex flex-col gap-4'>
      <Card>
        <CardHeader>
          <CardTitle role='heading' aria-level={2}>
            Credit balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {balance.data ? (
            <dl className='grid gap-4 sm:grid-cols-3'>
              <div>
                <dt className='text-muted-foreground text-sm'>Credits consumed</dt>
                <dd className='text-xl font-semibold tabular-nums'>
                  {number.format(balance.data.consumedCredits)}
                </dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-sm'>Available credits</dt>
                <dd className='text-xl font-semibold tabular-nums'>
                  {number.format(balance.data.availableCredits)}
                </dd>
              </div>
              {balance.data.subscriptionPlanType !== 'NOT_PAID' && (
                <div>
                  <dt className='text-muted-foreground text-sm'>Credit usage</dt>
                  <dd className='text-xl font-semibold tabular-nums'>
                    {number.format(balance.data.creditUsagePercentage)}%
                  </dd>
                </div>
              )}
            </dl>
          ) : balance.isSuccess ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <Gem aria-hidden='true' />
                </EmptyMedia>
                <EmptyTitle>This project has no credit balance</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <BillingLoadState
              isPending={balance.isPending}
              errorTitle='Could not load credit balance'
              onRetry={() => void balance.refetch()}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle role='heading' aria-level={2} className='self-center'>
            Monthly consumption
          </CardTitle>
          <CardAction>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger aria-label='Consumption month' className='w-44'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((date, index) => (
                  <SelectItem key={date.toISOString()} value={String(index)}>
                    {monthLabel.format(date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!summary.data ? (
            <BillingLoadState
              isPending={summary.isPending}
              errorTitle='Could not load credit consumption'
              onRetry={() => void summary.refetch()}
            />
          ) : summary.data.products.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <CalendarDays aria-hidden='true' />
                </EmptyMedia>
                <EmptyTitle>No consumption for this month</EmptyTitle>
                <EmptyDescription>Choose another month to see earlier usage.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div>
                <p className='text-sm font-medium'>
                  {summary.data.credits === null ? '—' : number.format(summary.data.credits)}{' '}
                  billable credits
                </p>
                {updated && (
                  <p className='text-muted-foreground text-sm'>
                    Last calculated {new Date(updated).toLocaleString()}
                  </p>
                )}
              </div>
              <Accordion type='multiple'>
                {summary.data.products.map(product => (
                  <AccordionItem key={product.product} value={product.product}>
                    <AccordionTrigger>
                      {readableName(product.product)} · {number.format(product.credits)} credits
                    </AccordionTrigger>
                    <AccordionContent className='space-y-3'>
                      <ConsumptionTable product={product} />
                      <Accordion type='multiple'>
                        {product.units.map(unit =>
                          unit.decomposition?.length ? (
                            <AccordionItem key={unit.unit} value={unit.unit}>
                              <AccordionTrigger>{readableName(unit.unit)} details</AccordionTrigger>
                              <AccordionContent>
                                <Breakdown
                                  branches={unit.decomposition}
                                  projections={product.entityProjections}
                                />
                              </AccordionContent>
                            </AccordionItem>
                          ) : null
                        )}
                      </Accordion>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
