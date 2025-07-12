import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { Checkbox } from '@owox/ui/components/checkbox';

interface SchemaFieldPrimaryKeyCheckboxProps {
  isPrimaryKey: unknown;
  onPrimaryKeyChange?: (isPrimaryKey: boolean) => void;
}

export function SchemaFieldPrimaryKeyCheckbox({
  isPrimaryKey,
  onPrimaryKeyChange,
}: SchemaFieldPrimaryKeyCheckboxProps) {
  // Convert to boolean to ensure proper type
  const isPrimaryKeyBoolean = Boolean(isPrimaryKey);

  // Generate unique ID for tooltip
  const tooltipId = 'schema-field-primary-key-tooltip';

  // Handle checkbox change
  const handleCheckedChange = (checked: boolean) => {
    if (onPrimaryKeyChange) {
      onPrimaryKeyChange(checked);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Checkbox
              checked={isPrimaryKeyBoolean}
              onCheckedChange={handleCheckedChange}
              aria-label='Primary Key'
              aria-describedby={tooltipId}
              tabIndex={0}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent id={tooltipId} side='bottom' role='tooltip'>
          <div className='text-xs font-medium'>Primary Key</div>
          <div className='mt-1 max-w-xs text-xs break-words whitespace-normal'>
            A primary key uniquely identifies each record in the table. It ensures data integrity by
            preventing duplicate or null values in the key column.
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
