import { ChevronDown, ChevronRight, KeyRound } from 'lucide-react';
import { OWOX_YELLOW_BASE } from './owox-palette';
import {
  ALL_FIELD_ROW_LABELS,
  collapsedRowCount,
  fieldAliasLine,
  fieldDescriptionLine,
  orderFields,
  type ErdCardField,
  type ErdFieldRowLabels,
} from './erd-fields';

function FieldRow({ field, labels }: { field: ErdCardField; labels: ErdFieldRowLabels }) {
  const alias = fieldAliasLine(field, labels);
  const description = fieldDescriptionLine(field, labels);
  return (
    <div
      className='border-border/50 border-b px-3.5 py-1.5 text-[11.5px] last:border-b-0'
      style={{ opacity: field.isHidden ? 0.5 : 1 }}
      title={field.isHidden ? `${field.name} (hidden from reporting)` : field.name}
    >
      <div className='flex items-center gap-2'>
        {field.isPrimaryKey ? (
          <KeyRound
            className='h-3 w-3 shrink-0'
            style={{ color: OWOX_YELLOW_BASE }}
            aria-label='Primary key'
          />
        ) : (
          <span className='w-3 shrink-0' />
        )}
        <span className='text-foreground flex-1 truncate'>{field.name}</span>
        <span className='text-muted-foreground shrink-0 font-mono text-[10px] tracking-tight'>
          {field.type}
        </span>
      </div>
      {/* Optional lines are single-line (truncated) so the row height stays
          predictable for the layout; the full text lives in the tooltip. */}
      {alias && (
        <div
          className='text-muted-foreground truncate pl-5 text-[10.5px] leading-[14px]'
          title={alias}
        >
          {alias}
        </div>
      )}
      {description && (
        <div
          className='text-muted-foreground/80 truncate pl-5 text-[10.5px] leading-[14px] italic'
          title={description}
        >
          {description}
        </div>
      )}
    </div>
  );
}

interface ErdCardFieldsSectionProps {
  fields: ErdCardField[];
  /** Which optional lines each row shows; defaults to all of them. */
  labels?: ErdFieldRowLabels;
  /**
   * Expansion state is owned by the node component (which stays mounted across
   * Compact↔Detailed toggles), so an expanded card survives a view-mode
   * round-trip instead of resetting when this section unmounts.
   */
  expanded: boolean;
  onToggleExpanded: () => void;
}

/**
 * The ERD card body: collapsed field rows with an in-place "+N more" toggle.
 * The layout is sized to the collapsed height, so an expanded card may overlap
 * the card below (as in owox/models).
 */
export function ErdCardFieldsSection({
  fields,
  labels = ALL_FIELD_ROW_LABELS,
  expanded,
  onToggleExpanded,
}: ErdCardFieldsSectionProps) {
  const ordered = orderFields(fields);
  const collapsed = collapsedRowCount(fields);
  const visible = expanded ? ordered : ordered.slice(0, collapsed);
  const hiddenCount = ordered.length - collapsed;

  function toggleExpanded(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    onToggleExpanded();
  }

  return (
    <div className='border-t'>
      {visible.map(field => (
        <FieldRow key={field.name} field={field} labels={labels} />
      ))}
      {hiddenCount > 0 && (
        <button
          type='button'
          className='text-muted-foreground hover:text-foreground hover:bg-muted nodrag flex w-full items-center justify-center gap-1 border-t py-1.5 text-[11px] font-medium transition-colors'
          onPointerDown={e => {
            e.stopPropagation();
          }}
          onClick={toggleExpanded}
        >
          {expanded ? (
            <>
              <ChevronDown className='h-3 w-3' /> Show less
            </>
          ) : (
            <>
              <ChevronRight className='h-3 w-3' /> +{hiddenCount} more field
              {hiddenCount !== 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  );
}
