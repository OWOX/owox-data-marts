import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { FunctionSquare } from 'lucide-react';
import { describeMissingReferences } from '../../../../../shared/utils/calculated-field-issues';

interface SchemaFieldCalculatedIconProps {
  /**
   * The names this metric's formula can no longer resolve. Omitted or empty = healthy.
   */
  missingReferences?: readonly string[];
}

const HEALTHY = {
  tooltipId: 'schema-field-calculated-tooltip',
  color: 'text-green-500',
  label: 'Calculated field',
  description: 'Computed from a formula, not read from a warehouse column',
};

const BROKEN_TOOLTIP_ID = 'schema-field-calculated-broken-tooltip';

/**
 * The status-column icon a calculated field gets instead of `SchemaFieldStatusIcon`. A calculated
 * metric has no warehouse column behind it, so a connected/disconnected status describes nothing
 * about it — this marks what the row IS, and carries the one state it can be in: green while its
 * formula resolves, red once a field it references is gone. Same shape as the status icon it
 * replaces (tooltip, role, accessible name, focusability), so the column keeps behaving identically.
 */
export function SchemaFieldCalculatedIcon({ missingReferences }: SchemaFieldCalculatedIconProps) {
  const brokenDescription = describeMissingReferences(missingReferences ?? []);
  const { tooltipId, color, label, description } = brokenDescription
    ? {
        tooltipId: BROKEN_TOOLTIP_ID,
        color: 'text-red-500',
        label: 'Calculated field with a broken reference',
        description: brokenDescription,
      }
    : HEALTHY;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <FunctionSquare
            className={cn('h-5 w-5', color)}
            role='img'
            aria-label={label}
            aria-describedby={tooltipId}
            tabIndex={0}
          />
        </TooltipTrigger>
        <TooltipContent id={tooltipId} role='tooltip'>
          <div className='text-xs font-medium'>{label}</div>
          <div className='mt-1 max-w-xs text-xs break-words whitespace-normal'>{description}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
