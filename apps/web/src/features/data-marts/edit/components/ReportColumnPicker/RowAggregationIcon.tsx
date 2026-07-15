import { useState } from 'react';
import { Sigma } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import type { DateTruncUnit } from '../../../shared/types/output-config';
import type { ReportAggregateFunction } from '../../../shared/types/relationship.types';
import { AggregationEditorPopover, type AggregationDraft } from './AggregationEditorPopover';

interface RowAggregationIconProps {
  column: string;
  fieldType: string;
  /** Business-readable field name shown in the popover header; falls back to `column`. */
  displayLabel?: string;
  /** Joined data mart name shown under the field name; absent for home-mart fields. */
  dataMartName?: string;
  /** Functions the column may be aggregated by (resolved via governance). */
  allowedAggregations: readonly ReportAggregateFunction[];
  /** Functions currently assigned to this column. */
  activeFunctions: readonly ReportAggregateFunction[];
  /** Date-trunc bucket currently assigned to this column (date fields only). */
  activeBucket: DateTruncUnit | null;
  /** Date-trunc time zone currently assigned to this column's bucket (date fields only). */
  activeTimeZone?: string | null;
  /**
   * Keep the icon visible even when inactive. Set for standalone triggers that live
   * outside a `group/row` list (e.g. the Aggregations dropdown "add" entry), where the
   * default hover-gating would leave nothing to reveal the icon.
   */
  alwaysVisible?: boolean;
  /** Open the editor immediately on mount (the dropdown's pending "add" entry). */
  autoOpen?: boolean;
  /** Fired whenever the editor closes, so a pending selection can be reset. */
  onClose?: () => void;
  onApplyDraft: (draft: AggregationDraft) => void;
}

export function RowAggregationIcon({
  column,
  fieldType,
  displayLabel,
  dataMartName,
  allowedAggregations,
  activeFunctions,
  activeBucket,
  activeTimeZone,
  alwaysVisible = false,
  autoOpen = false,
  onClose,
  onApplyDraft,
}: RowAggregationIconProps) {
  const [open, setOpen] = useState(autoOpen);
  const count = activeFunctions.length + (activeBucket !== null ? 1 : 0);
  const isActive = count > 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) onClose?.();
  };

  const trigger = (
    <button
      type='button'
      aria-label={isActive ? 'Manage aggregations' : 'Add aggregation'}
      className={cn(
        'flex h-6 w-6 items-center justify-center gap-0.5 rounded transition-opacity',
        isActive
          ? 'text-blue-500 opacity-100'
          : alwaysVisible
            ? 'text-muted-foreground hover:text-foreground opacity-100'
            : 'text-muted-foreground hover:text-foreground opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100'
      )}
    >
      <Sigma className='h-4 w-4' />
    </button>
  );

  return (
    <AggregationEditorPopover
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      column={column}
      fieldType={fieldType}
      displayLabel={displayLabel}
      dataMartName={dataMartName}
      allowedAggregations={allowedAggregations}
      initialFunctions={activeFunctions}
      initialBucket={activeBucket}
      initialTimeZone={activeTimeZone}
      onApply={onApplyDraft}
    />
  );
}
