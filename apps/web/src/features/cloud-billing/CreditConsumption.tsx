import { useId, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ExternalLink, Gem } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { CardAction, CardContent, CardHeader, CardTitle } from '@owox/ui/components/card';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { appHelpLinks } from '../../shared/constants/app-help-links';
import { BillingLoadState } from './BillingLoadState';
import { formatDateShort } from '../../utils/date-formatters';
import { ConsumptionDetails } from './ConsumptionDetails';
import { consumptionOperationTitle, consumptionProductTitle } from './consumption-labels';
import {
  useCloudBillingQuery,
  type ConsumptionProduct,
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

const column = createColumnHelper<ConsumptionUnit>();
const unitPrice = new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 });
const numericColumns = [
  { key: 'consumption', label: 'Usage' },
  { key: 'roundedConsumption', label: 'Billable units' },
  { key: 'consumptionUnitPrice', label: 'Credits per unit' },
  { key: 'credits', label: 'Credits' },
] as const;
const consumptionColumns = numericColumns.map(({ key, label }) =>
  column.accessor(key, {
    header: () => <div className='pr-4 text-right'>{label}</div>,
    cell: ({ getValue }) => (
      <div className='pr-4 text-right tabular-nums'>
        {(key === 'consumptionUnitPrice' ? unitPrice : number).format(getValue())}
      </div>
    ),
    size: 110,
  })
);

function ConsumptionTable({
  product,
  expandedUnit,
  onToggle,
}: {
  product: ConsumptionProduct;
  expandedUnit: string | null;
  onToggle: (unit: string) => void;
}) {
  const tableId = useId();
  const units = useMemo(
    () => [...product.units].sort((a, b) => b.credits - a.credits),
    [product.units]
  );
  const columns = useMemo(
    () => [
      column.accessor('unit', {
        header: 'Operation',
        cell: ({ getValue, row }) => {
          const unit = getValue();
          const title = consumptionOperationTitle(unit);
          if (!row.original.decomposition?.length) return title;
          const expanded = expandedUnit === unit;
          return (
            <Button
              variant='ghost'
              size='sm'
              aria-expanded={expanded}
              className='-ml-2 h-auto justify-start gap-2 px-2 py-1 text-left whitespace-normal'
              onClick={event => {
                event.stopPropagation();
                onToggle(unit);
              }}
            >
              <ChevronDown aria-hidden='true' className={expanded ? 'rotate-180' : undefined} />
              {title}
            </Button>
          );
        },
        size: 250,
      }),
      ...consumptionColumns,
    ],
    [expandedUnit, onToggle]
  );
  const table = useReactTable({
    columns,
    data: units,
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
          ariaLabel={`${consumptionProductTitle(product.product)} consumption`}
          showPagination={false}
          onRowClick={row => {
            if (row.original.decomposition?.length) onToggle(row.id);
          }}
          renderExpandedRow={row =>
            expandedUnit === row.id ? (
              <ConsumptionDetails product={product} unit={row.original} />
            ) : null
          }
        />
      </div>
    </div>
  );
}

export function CreditConsumption({ origin }: { origin: string }) {
  const [months] = useState(() => getMonths(new Date()));
  const [selected, setSelected] = useState('0');
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
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
    <div className='flex flex-col gap-4'>
      <div className='dm-card flex flex-col gap-4'>
        <CardHeader className='flex items-center gap-1 px-0'>
          <CardTitle role='heading' aria-level={2}>
            Credit balance
          </CardTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant='ghost' size='icon-sm' className='text-muted-foreground'>
                <a
                  href={appHelpLinks.creditConsumption}
                  target='_blank'
                  rel='noopener noreferrer'
                  aria-label='Credit consumption help'
                >
                  <ExternalLink aria-hidden='true' />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Credit consumption help</TooltipContent>
          </Tooltip>
        </CardHeader>
        <CardContent className='px-0'>
          {balance.data ? (
            <dl className='grid gap-4 sm:grid-cols-3'>
              <div>
                <dt className='text-muted-foreground text-sm'>Credits consumed</dt>
                <dd className='text-xl font-semibold tabular-nums'>
                  {number.format(balance.data.consumedCredits)}
                </dd>
              </div>
              {balance.data.subscriptionPlanType !== 'NOT_PAID' && (
                <>
                  <div>
                    <dt className='text-muted-foreground text-sm'>Available credits</dt>
                    <dd className='text-xl font-semibold tabular-nums'>
                      {number.format(balance.data.availableCredits)}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground text-sm'>Credit usage</dt>
                    <dd className='text-xl font-semibold tabular-nums'>
                      {number.format(balance.data.creditUsagePercentage)}%
                    </dd>
                  </div>
                </>
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
      </div>
      <div className='dm-card flex flex-col gap-4'>
        <CardHeader className='px-0'>
          <CardTitle role='heading' aria-level={2} className='self-center'>
            Monthly consumption
          </CardTitle>
          <CardAction>
            <Select
              value={selected}
              onValueChange={value => {
                setExpandedUnit(null);
                setSelected(value);
              }}
            >
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
        <CardContent className='space-y-4 px-0'>
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
                    Last calculated {formatDateShort(updated)}
                  </p>
                )}
              </div>
              <Accordion
                key={selected}
                type='multiple'
                defaultValue={summary.data.products.map(product => product.product)}
              >
                {summary.data.products.map(product => (
                  <AccordionItem key={product.product} value={product.product}>
                    <AccordionTrigger>
                      {consumptionProductTitle(product.product)} · {number.format(product.credits)}{' '}
                      credits
                    </AccordionTrigger>
                    <AccordionContent className='space-y-3'>
                      <ConsumptionTable
                        product={product}
                        expandedUnit={expandedUnit}
                        onToggle={unit => {
                          setExpandedUnit(current => (current === unit ? null : unit));
                        }}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </>
          )}
        </CardContent>
      </div>
    </div>
  );
}
