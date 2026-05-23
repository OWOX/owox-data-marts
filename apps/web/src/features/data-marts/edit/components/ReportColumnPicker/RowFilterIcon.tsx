import { useEffect, useRef, useState } from 'react';
import { Filter } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { FilterEditorPopover } from './FilterEditorPopover';
import { FilterOrSliceEditorPopover } from './FilterOrSliceEditorPopover';
import type { FilterRule } from '../../../shared/types/output-config';

interface SliceIconProps {
  aliasPath: string;
  originalFieldName: string;
  /** Pre-join filters already active for this aliasPath+column combination. */
  existingSlices: readonly FilterRule[];
  /** Add a pre-join FilterRule (placement+aliasPath already set by the popover). */
  onAddSlice: (rule: FilterRule) => void;
  onRemoveSliceAt: (globalIndex: number) => void;
  onReplaceSliceAt?: (localIndex: number, rule: FilterRule) => void;
  existingSliceIndices: readonly number[];
}

interface RowFilterIconProps {
  column: string;
  fieldType: string;
  activeRules: readonly FilterRule[];
  onAdd: (rule: FilterRule) => void;
  onRemoveAt: (index: number) => void;
  onReplaceAt?: (localIndex: number, rule: FilterRule) => void;
  sliceIconProps?: SliceIconProps;
}

export function RowFilterIcon({
  column,
  fieldType,
  activeRules,
  onAdd,
  onRemoveAt,
  onReplaceAt,
  sliceIconProps,
}: RowFilterIconProps) {
  const [open, setOpen] = useState(false);
  const filterCount = activeRules.length;
  const sliceCount = sliceIconProps?.existingSlices.length ?? 0;
  const totalCount = filterCount + sliceCount;
  const isActive = totalCount > 0;
  const defaultTab: 'filter' | 'slice' = filterCount === 0 && sliceCount > 0 ? 'slice' : 'filter';

  const editFilter = filterCount === 1 && onReplaceAt ? activeRules[0] : undefined;
  const editSlice =
    sliceCount === 1 && sliceIconProps?.onReplaceSliceAt
      ? sliceIconProps.existingSlices[0]
      : undefined;

  const targetFilterRef = useRef<FilterRule | null>(null);
  const targetSliceRef = useRef<FilterRule | null>(null);
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      targetFilterRef.current = editFilter ?? null;
      targetSliceRef.current = editSlice ?? null;
    } else if (!open && prevOpenRef.current) {
      targetFilterRef.current = null;
      targetSliceRef.current = null;
    }
    prevOpenRef.current = open;
  }, [open, editFilter, editSlice]);

  const handleFilterApply = (rule: FilterRule) => {
    const target = targetFilterRef.current ?? editFilter;
    if (target && onReplaceAt) {
      const currentIdx = activeRules.indexOf(target);
      if (currentIdx >= 0) {
        onReplaceAt(currentIdx, rule);
        return;
      }
    }
    onAdd(rule);
  };
  const replaceSliceAt = sliceIconProps?.onReplaceSliceAt;
  const addSlice = sliceIconProps?.onAddSlice;
  const sliceList = sliceIconProps?.existingSlices;
  const handleSliceApply = addSlice
    ? (rule: FilterRule) => {
        const target = targetSliceRef.current ?? editSlice;
        if (target && replaceSliceAt && sliceList) {
          const currentIdx = sliceList.indexOf(target);
          if (currentIdx >= 0) {
            replaceSliceAt(currentIdx, rule);
            return;
          }
        }
        addSlice(rule);
      }
    : undefined;

  const trigger = (
    <button
      type='button'
      aria-label={isActive ? 'Manage filters and slices' : 'Add filter'}
      className={cn(
        'ml-auto flex h-6 w-6 items-center justify-center gap-0.5 rounded transition-opacity',
        isActive
          ? 'text-blue-500 opacity-100'
          : 'text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100'
      )}
    >
      <Filter className='h-4 w-4' />
      {totalCount > 1 && (
        <span className='text-[10px] leading-none font-semibold tabular-nums'>{totalCount}</span>
      )}
    </button>
  );

  if (sliceIconProps && handleSliceApply) {
    return (
      <FilterOrSliceEditorPopover
        open={open}
        onOpenChange={setOpen}
        column={column}
        sliceColumn={sliceIconProps.originalFieldName}
        fieldType={fieldType}
        aliasPath={sliceIconProps.aliasPath}
        defaultTab={defaultTab}
        filterProps={{
          onApply: handleFilterApply,
          initialRule: editFilter,
          existingRules: editFilter ? [] : activeRules,
          onRemoveExistingAt: onRemoveAt,
        }}
        sliceProps={{
          onApply: handleSliceApply,
          initialRule: editSlice,
          existingSlicesForColumn: editSlice ? [] : sliceIconProps.existingSlices,
          onRemoveExistingAt: localIdx => {
            sliceIconProps.onRemoveSliceAt(sliceIconProps.existingSliceIndices[localIdx]);
          },
        }}
        trigger={trigger}
      />
    );
  }

  return (
    <FilterEditorPopover
      open={open}
      onOpenChange={setOpen}
      column={column}
      fieldType={fieldType}
      onApply={handleFilterApply}
      initialRule={editFilter}
      existingRules={editFilter ? [] : activeRules}
      onRemoveExistingAt={onRemoveAt}
      trigger={trigger}
    />
  );
}
