import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Button } from '@owox/ui/components/button';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Label } from '@owox/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { DATE_TRUNC_UNITS, type DateTruncUnit } from '../../../shared/types/output-config';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';
import { aggregateFunctionLabel } from '../../../shared/utils/aggregation-labels';
import { isDateType, isTimestampType } from './output-controls-operators';

/**
 * What the per-field popover edits for ONE column. A column can carry several
 * aggregate functions (each → its own output column) OR — for a date — a single
 * date-trunc bucket that turns it into a grouped dimension. The two are mutually
 * exclusive for a date field; metric/string/bool fields only use `functions`.
 */
export interface AggregationDraft {
  functions: ReportAggregateFunction[];
  bucket: DateTruncUnit | null;
  /** IANA time zone for the bucket; null = no conversion (truncate the raw value). */
  timeZone: string | null;
}

/**
 * Small curated set of IANA zones for the optional bucket time-zone control. `null` =
 * the default "No conversion" entry. The value is validated again on the backend
 * (IANA_TIME_ZONE_PATTERN) before it is inlined into SQL.
 */
// Radix Select forbids an empty-string item value, so the "No conversion" entry uses a
// sentinel that maps back to null.
const NO_TIME_ZONE_VALUE = '__none__';

const DATE_TRUNC_TIME_ZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Kyiv',
  'Europe/Berlin',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export interface AggregationEditorPopoverProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger: ReactNode;
  column: string;
  /** Field type drives the popover shape (date → bucket-or-aggregate; else multi-select). */
  fieldType: string;
  /** Business-readable field name shown in the header; falls back to `column`. */
  displayLabel?: string;
  /** Joined data mart name shown under the field name; absent for home-mart fields. */
  dataMartName?: string;
  /** Functions the column may be aggregated by (already resolved via governance). */
  allowedAggregations: readonly ReportAggregateFunction[];
  /** Functions already assigned to this column. */
  initialFunctions?: readonly ReportAggregateFunction[];
  /** Date-trunc bucket already assigned to this column (date fields only). */
  initialBucket?: DateTruncUnit | null;
  /** Time zone already assigned to this column's bucket (date fields only). */
  initialTimeZone?: string | null;
  onApply: (draft: AggregationDraft) => void;
  onCancel?: () => void;
}

export function AggregationEditorPopover(props: AggregationEditorPopoverProps) {
  const isDate = isDateType(props.fieldType);
  // Timezone conversion requires a sub-day type; pure DATE columns must not show it.
  const supportsTimeZone = isTimestampType(props.fieldType);
  const [functions, setFunctions] = useState<ReportAggregateFunction[]>(() => [
    ...(props.initialFunctions ?? []),
  ]);
  // For date fields: bucket and functions are mutually exclusive. `null` = aggregate mode.
  const [bucket, setBucket] = useState<DateTruncUnit | null>(props.initialBucket ?? null);
  const [timeZone, setTimeZone] = useState<string | null>(props.initialTimeZone ?? null);

  // Reset the draft only on the closed→open transition so a parent re-render
  // mid-edit cannot wipe an in-progress selection (mirrors FilterEditorPopover).
  const prevOpen = useRef(false);
  useEffect(() => {
    if (props.open && !prevOpen.current) {
      setFunctions([...(props.initialFunctions ?? [])]);
      setBucket(props.initialBucket ?? null);
      setTimeZone(props.initialTimeZone ?? null);
    }
    prevOpen.current = props.open;
  }, [props.open, props.initialFunctions, props.initialBucket, props.initialTimeZone]);

  const allowedSet = useMemo(() => new Set(props.allowedAggregations), [props.allowedAggregations]);

  function toggleFunction(fn: ReportAggregateFunction, checked: boolean) {
    // Choosing an aggregate function clears any bucket (mutually exclusive on dates).
    setBucket(null);
    setTimeZone(null);
    setFunctions(prev =>
      checked ? [...prev.filter(f => f !== fn), fn] : prev.filter(f => f !== fn)
    );
  }

  function chooseBucket(unit: DateTruncUnit) {
    // Picking a bucket clears any aggregate functions for this column.
    setFunctions([]);
    setBucket(unit);
  }

  function clearBucket() {
    setBucket(null);
    setTimeZone(null);
  }

  function handleApply() {
    const nextBucket = isDate ? bucket : null;
    props.onApply({
      functions: props.allowedAggregations.filter(fn => functions.includes(fn)),
      bucket: nextBucket,
      // Time zone only rides along with an active bucket.
      timeZone: nextBucket !== null ? timeZone : null,
    });
    props.onOpenChange(false);
  }

  function handleCancel() {
    props.onCancel?.();
    props.onOpenChange(false);
  }

  const bucketActive = isDate && bucket !== null;
  // A brand-new column (nothing pre-selected) must choose a function or bucket — an
  // empty Apply would silently discard it. Editing an existing selection keeps Apply
  // enabled so clearing it and applying removes the rule.
  const hadInitialSelection =
    (props.initialFunctions?.length ?? 0) > 0 || (props.initialBucket ?? null) !== null;
  const canApply =
    props.allowedAggregations.some(fn => functions.includes(fn)) ||
    bucketActive ||
    hadInitialSelection;

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
      <PopoverContent className='w-72 space-y-3'>
        <div>
          <div className='text-sm font-medium'>{props.displayLabel ?? props.column}</div>
          {props.dataMartName && (
            <div className='text-muted-foreground text-[11px]'>{props.dataMartName}</div>
          )}
        </div>

        {isDate && (
          <div className='space-y-1'>
            <Label>Group by bucket</Label>
            <Select
              value={bucket ?? undefined}
              onValueChange={value => {
                chooseBucket(value as DateTruncUnit);
              }}
            >
              <SelectTrigger className='w-full' aria-label='Group by bucket'>
                <SelectValue placeholder='No bucket' />
              </SelectTrigger>
              <SelectContent>
                {DATE_TRUNC_UNITS.map(unit => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bucketActive && (
              <Button
                variant='ghost'
                size='sm'
                className='text-muted-foreground hover:text-foreground h-6 px-1 text-xs'
                onClick={clearBucket}
              >
                Clear bucket
              </Button>
            )}
            {bucketActive && supportsTimeZone && (
              <div className='space-y-1 pt-1'>
                <Label>Time zone (optional)</Label>
                <Select
                  aria-label='Time zone'
                  value={timeZone ?? NO_TIME_ZONE_VALUE}
                  onValueChange={value => {
                    setTimeZone(value === NO_TIME_ZONE_VALUE ? null : value);
                  }}
                >
                  <SelectTrigger className='w-full' aria-label='Time zone'>
                    <SelectValue placeholder='No conversion' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TIME_ZONE_VALUE}>No conversion</SelectItem>
                    {DATE_TRUNC_TIME_ZONES.map(tz => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {props.allowedAggregations.length > 0 && (
          <div className='space-y-1'>
            <Label>{isDate ? 'Or aggregate by' : 'Aggregate by'}</Label>
            <div className='max-h-48 space-y-1 overflow-y-auto'>
              {props.allowedAggregations.map(fn => {
                const checked = !bucketActive && functions.includes(fn) && allowedSet.has(fn);
                return (
                  <label
                    key={fn}
                    className='hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs'
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={c => {
                        toggleFunction(fn, c === true);
                      }}
                      aria-label={fn}
                    />
                    <span>{aggregateFunctionLabel(fn)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className='flex justify-end gap-2'>
          <Button variant='outline' size='sm' onClick={handleCancel}>
            Cancel
          </Button>
          <Button size='sm' onClick={handleApply} disabled={!canApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
