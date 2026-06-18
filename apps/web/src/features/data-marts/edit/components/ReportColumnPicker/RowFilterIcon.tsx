import { useEffect, useRef, useState } from 'react';
import { Filter } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { ActiveRulesPopover } from './ActiveRulesPopover';
import { FilterEditorPopover } from './FilterEditorPopover';
import { FilterOrSliceEditorPopover } from './FilterOrSliceEditorPopover';
import type { FilterRule } from '../../../shared/types/output-config';

interface SliceIconProps {
  /** Unified blended-field name used as rule.column for pre-join rules. */
  unifiedFieldName: string;
  /** Pre-join filters already active for this unified column. */
  existingSlices: readonly FilterRule[];
  /**
   * Add a pre-join FilterRule (placement already set by the popover).
   * Omit when adding slices is not allowed.
   */
  onAddSlice?: (rule: FilterRule) => void;
  onRemoveSliceAt: (globalIndex: number) => void;
  onReplaceSliceAt?: (localIndex: number, rule: FilterRule) => void;
  existingSliceIndices: readonly number[];
}

interface RowFilterIconProps {
  column: string;
  fieldType: string;
  /** Business-readable field name shown in popover headers; falls back to `column`. */
  displayLabel?: string;
  /** Joined data mart name shown under the field name; absent for home-mart fields. */
  dataMartName?: string;
  activeRules: readonly FilterRule[];
  /** Omit to render the icon in remove-only mode (still shows count and exposes onRemoveAt). */
  onAdd?: (rule: FilterRule) => void;
  onRemoveAt: (index: number) => void;
  onReplaceAt?: (localIndex: number, rule: FilterRule) => void;
  sliceIconProps?: SliceIconProps;
}

export function RowFilterIcon({
  column,
  fieldType,
  displayLabel,
  dataMartName,
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

  // Snapshot index on open — reference identity flips when the parent rerenders mid-edit.
  const editingFilterIndexRef = useRef<number | null>(null);
  const editingSliceIndexRef = useRef<number | null>(null);
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      editingFilterIndexRef.current = editFilter ? activeRules.indexOf(editFilter) : null;
      editingSliceIndexRef.current =
        editSlice && sliceIconProps ? sliceIconProps.existingSlices.indexOf(editSlice) : null;
    } else if (!open && prevOpenRef.current) {
      editingFilterIndexRef.current = null;
      editingSliceIndexRef.current = null;
    }
    prevOpenRef.current = open;
  }, [open, editFilter, editSlice, activeRules, sliceIconProps]);

  const handleFilterApply = (rule: FilterRule) => {
    const idx = editingFilterIndexRef.current;
    if (idx != null && idx >= 0 && onReplaceAt) {
      onReplaceAt(idx, rule);
      return;
    }
    onAdd?.(rule);
  };
  const replaceSliceAt = sliceIconProps?.onReplaceSliceAt;
  const addSlice = sliceIconProps?.onAddSlice;
  const canEdit = !!onAdd || !!onReplaceAt || !!addSlice || !!replaceSliceAt;
  const sliceTabAvailable =
    !!sliceIconProps && (!!addSlice || sliceIconProps.existingSlices.length > 0);
  const handleSliceApply = sliceTabAvailable
    ? (rule: FilterRule) => {
        const idx = editingSliceIndexRef.current;
        if (idx != null && idx >= 0 && replaceSliceAt) {
          replaceSliceAt(idx, rule);
          return;
        }
        addSlice?.(rule);
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

  // Nothing editable (disconnected / no-access rows) — stale references can only be cleared.
  if (!canEdit) {
    return (
      <ActiveRulesPopover
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        column={column}
        fieldType={fieldType}
        displayLabel={displayLabel}
        dataMartName={dataMartName}
        sliceColumn={sliceIconProps?.unifiedFieldName}
        filters={{ rules: activeRules, onRemoveAt }}
        slices={
          sliceIconProps
            ? {
                rules: sliceIconProps.existingSlices,
                onRemoveAt: localIdx => {
                  sliceIconProps.onRemoveSliceAt(sliceIconProps.existingSliceIndices[localIdx]);
                },
              }
            : undefined
        }
      />
    );
  }

  if (sliceIconProps && handleSliceApply) {
    return (
      <FilterOrSliceEditorPopover
        open={open}
        onOpenChange={setOpen}
        column={column}
        sliceColumn={sliceIconProps.unifiedFieldName}
        fieldType={fieldType}
        displayLabel={displayLabel}
        dataMartName={dataMartName}
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
      displayLabel={displayLabel}
      dataMartName={dataMartName}
      onApply={handleFilterApply}
      initialRule={editFilter}
      existingRules={editFilter ? [] : activeRules}
      onRemoveExistingAt={onRemoveAt}
      trigger={trigger}
    />
  );
}
