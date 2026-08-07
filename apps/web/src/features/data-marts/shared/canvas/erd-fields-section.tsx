import { useState } from 'react';
import { ChevronDown, ChevronRight, KeyRound } from 'lucide-react';
import { OWOX_YELLOW_BASE } from './owox-palette';
import { collapsedRowCount, orderFields, type ErdCardField } from './erd-fields';

function FieldRow({ field }: { field: ErdCardField }) {
  return (
    <div
      className='border-border/50 flex items-center gap-2 border-b px-3.5 py-1.5 text-[11.5px] last:border-b-0'
      style={{ opacity: field.isHidden ? 0.5 : 1 }}
      title={field.isHidden ? `${field.alias} (hidden from reporting)` : field.alias}
    >
      {field.isPrimaryKey ? (
        <KeyRound
          className='h-3 w-3 shrink-0'
          style={{ color: OWOX_YELLOW_BASE }}
          aria-label='Primary key'
        />
      ) : (
        <span className='w-3 shrink-0' />
      )}
      <span className='text-foreground flex-1 truncate'>{field.alias}</span>
      <span className='text-muted-foreground shrink-0 font-mono text-[10px] tracking-tight'>
        {field.type}
      </span>
    </div>
  );
}

/**
 * The ERD card body: collapsed field rows with an in-place "+N more" toggle.
 * Expansion is per-card local state; the layout is sized to the collapsed
 * height, so an expanded card may overlap the card below (as in owox/models).
 */
export function ErdCardFieldsSection({ fields }: { fields: ErdCardField[] }) {
  const [expanded, setExpanded] = useState(false);

  const ordered = orderFields(fields);
  const collapsed = collapsedRowCount(fields);
  const visible = expanded ? ordered : ordered.slice(0, collapsed);
  const hiddenCount = ordered.length - collapsed;

  function toggleExpanded(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(v => !v);
  }

  return (
    <div className='border-t'>
      {visible.map(field => (
        <FieldRow key={field.name} field={field} />
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
