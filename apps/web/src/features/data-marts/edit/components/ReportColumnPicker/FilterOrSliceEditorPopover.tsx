import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Button } from '@owox/ui/components/button';
import { Label } from '@owox/ui/components/label';
import { X, Layers } from 'lucide-react';
import type { FilterRule } from '../../../shared/types/output-config';
import { operatorLabelFor } from './output-controls-operators';
import { summarizeFilterRule } from './filter-rule-summary';
import { FilterEditorPopover, type FilterEditorPopoverProps } from './FilterEditorPopover';
import { FilterValueEditor } from './FilterValueEditor';

type FilterOnlyProps = Omit<
  FilterEditorPopoverProps,
  'open' | 'onOpenChange' | 'trigger' | 'column' | 'fieldType'
>;

interface SliceOnlyProps {
  onApply: (rule: FilterRule) => void;
  onCancel?: () => void;
  existingSlicesForColumn?: readonly FilterRule[];
  onRemoveExistingAt?: (index: number) => void;
  initialRule?: FilterRule;
}

export interface FilterOrSliceEditorPopoverProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger: ReactNode;
  column: string;
  fieldType: string;
  /** Business-readable field name shown in the header; falls back to `column`. */
  displayLabel?: string;
  /** Joined data mart name shown under the field name; absent for home-mart fields. */
  dataMartName?: string;
  aliasPath?: string;
  sliceColumn?: string;
  filterProps: FilterOnlyProps;
  sliceProps?: SliceOnlyProps;
  defaultTab?: 'filter' | 'slice';
}

export function FilterOrSliceEditorPopover(props: FilterOrSliceEditorPopoverProps) {
  const { aliasPath, sliceProps } = props;

  if (aliasPath == null || sliceProps == null) {
    return (
      <FilterEditorPopover
        open={props.open}
        onOpenChange={props.onOpenChange}
        trigger={props.trigger}
        column={props.column}
        fieldType={props.fieldType}
        displayLabel={props.displayLabel}
        dataMartName={props.dataMartName}
        {...props.filterProps}
      />
    );
  }

  return (
    <TabbedPopover
      {...props}
      aliasPath={aliasPath}
      sliceProps={sliceProps}
      sliceColumn={props.sliceColumn ?? props.column}
    />
  );
}

interface TabbedPopoverProps extends FilterOrSliceEditorPopoverProps {
  aliasPath: string;
  sliceProps: SliceOnlyProps;
  sliceColumn: string;
}

function TabbedPopover(props: TabbedPopoverProps) {
  const [tab, setTab] = useState<'filter' | 'slice'>(props.defaultTab ?? 'filter');
  const [filterDraft, setFilterDraft] = useState<FilterRule | null>(
    props.filterProps.initialRule ?? null
  );
  const [sliceDraft, setSliceDraft] = useState<FilterRule | null>(
    props.sliceProps.initialRule ?? null
  );
  const [error, setError] = useState<string | null>(null);

  // Reset on closed→open only — same pattern as FilterEditorPopover.
  const [openInstanceId, setOpenInstanceId] = useState(0);
  const prevOpen = useRef(false);
  useEffect(() => {
    if (props.open && !prevOpen.current) {
      setOpenInstanceId(id => id + 1);
      setTab(props.defaultTab ?? 'filter');
      setFilterDraft(props.filterProps.initialRule ?? null);
      setSliceDraft(props.sliceProps.initialRule ?? null);
      setError(null);
    }
    prevOpen.current = props.open;
  }, [props.open, props.defaultTab, props.filterProps.initialRule, props.sliceProps.initialRule]);

  const handleFilterChange = useCallback((rule: FilterRule | null) => {
    setFilterDraft(rule);
    setError(null);
  }, []);

  const handleSliceChange = useCallback((rule: FilterRule | null) => {
    setSliceDraft(rule);
    setError(null);
  }, []);

  function handleApply() {
    if (tab === 'filter') {
      if (!filterDraft) {
        setError('Value is required');
        return;
      }
      props.filterProps.onApply(filterDraft);
    } else {
      if (!sliceDraft) {
        setError('Value is required');
        return;
      }
      const preJoinRule = {
        ...sliceDraft,
        placement: 'pre-join' as const,
        aliasPath: props.aliasPath,
      } as FilterRule;
      props.sliceProps.onApply(preJoinRule);
    }
    props.onOpenChange(false);
  }

  function handleCancel() {
    if (tab === 'filter') {
      props.filterProps.onCancel?.();
    } else {
      props.sliceProps.onCancel?.();
    }
    props.onOpenChange(false);
  }

  const hasExistingFilters = !!props.filterProps.existingRules?.length;
  const hasExistingSlices = !!props.sliceProps.existingSlicesForColumn?.length;
  const applyLabel = (tab === 'filter' ? hasExistingFilters : hasExistingSlices) ? 'Add' : 'Apply';

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
      <PopoverContent className='w-72 space-y-3'>
        <div>
          <div className='text-sm font-medium'>
            {props.displayLabel ?? (tab === 'slice' ? props.sliceColumn : props.column)}
          </div>
          {props.dataMartName && (
            <div className='text-muted-foreground text-[11px]'>{props.dataMartName}</div>
          )}
        </div>

        <TabToggle tab={tab} onChange={setTab} />

        {tab === 'slice' && <SliceBanner />}

        {tab === 'filter' && hasExistingFilters && (
          <div className='space-y-1'>
            <Label>Active filters</Label>
            <div className='space-y-1'>
              {(props.filterProps.existingRules ?? []).map((rule, idx) => {
                const valueStr = summarizeFilterRule(rule);
                return (
                  <div
                    key={idx}
                    className='bg-muted/40 flex items-center gap-2 rounded px-2 py-1 text-xs'
                  >
                    <span className='flex-1 truncate font-mono' title={valueStr}>
                      <b>{operatorLabelFor(rule.operator, props.fieldType)}</b>
                      {valueStr && <>: {valueStr}</>}
                    </span>
                    {props.filterProps.onRemoveExistingAt && (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-6 w-6 p-0'
                        onClick={() => {
                          props.filterProps.onRemoveExistingAt?.(idx);
                        }}
                        aria-label='Remove filter'
                      >
                        <X className='h-3 w-3' />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'slice' && hasExistingSlices && (
          <div className='space-y-1'>
            <Label>Active slices</Label>
            <div className='space-y-1'>
              {(props.sliceProps.existingSlicesForColumn ?? []).map((rule, idx) => {
                const valueStr = summarizeFilterRule(rule);
                return (
                  <div
                    key={idx}
                    className='bg-muted/40 flex items-center gap-2 rounded px-2 py-1 text-xs'
                  >
                    <span className='flex-1 truncate font-mono' title={valueStr}>
                      <b>{operatorLabelFor(rule.operator, props.fieldType)}</b>
                      {valueStr && <>: {valueStr}</>}
                    </span>
                    {props.sliceProps.onRemoveExistingAt && (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-6 w-6 p-0'
                        onClick={() => {
                          props.sliceProps.onRemoveExistingAt?.(idx);
                        }}
                        aria-label='Remove slice'
                      >
                        <X className='h-3 w-3' />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Two editors mounted in parallel — hiding the inactive one preserves its draft. */}
        <div className={tab === 'filter' ? 'space-y-3' : 'hidden'}>
          <FilterValueEditor
            key={`filter-${String(openInstanceId)}`}
            column={props.column}
            fieldType={props.fieldType}
            initialRule={props.filterProps.initialRule}
            onChange={handleFilterChange}
          />
        </div>
        <div className={tab === 'slice' ? 'space-y-3' : 'hidden'}>
          <FilterValueEditor
            key={`slice-${String(openInstanceId)}`}
            column={props.sliceColumn}
            fieldType={props.fieldType}
            initialRule={props.sliceProps.initialRule}
            onChange={handleSliceChange}
          />
        </div>

        {error && <div className='text-destructive text-xs'>{error}</div>}

        <div className='flex justify-end gap-2'>
          <Button variant='outline' size='sm' onClick={handleCancel}>
            Cancel
          </Button>
          <Button size='sm' onClick={handleApply}>
            {applyLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TabToggleProps {
  tab: 'filter' | 'slice';
  onChange: (tab: 'filter' | 'slice') => void;
}

function TabToggle({ tab, onChange }: TabToggleProps) {
  return (
    <div className='flex gap-1 rounded-md border p-0.5'>
      <button
        type='button'
        className={`flex-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
          tab === 'filter'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => {
          onChange('filter');
        }}
      >
        Filter
      </button>
      <button
        type='button'
        className={`flex-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
          tab === 'slice'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => {
          onChange('slice');
        }}
      >
        Slice
      </button>
    </div>
  );
}

function SliceBanner() {
  return (
    <div className='bg-muted/40 flex items-start gap-2 rounded p-2 text-[11px]'>
      <Layers className='h-4 w-4 shrink-0 text-blue-600' />
      <div>
        Slices filter the <b>joined data mart</b> before it is joined — reducing rows pulled in.
      </div>
    </div>
  );
}
