import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { BigQueryFieldMode } from '../../../../shared/types/data-mart-schema.types';

interface SchemaFieldModeSelectProps {
  mode: BigQueryFieldMode;
  onModeChange?: (newMode: BigQueryFieldMode) => void;
}

export function SchemaFieldModeSelect({ mode, onModeChange }: SchemaFieldModeSelectProps) {
  // Get all BigQuery field modes
  const fieldModes = Object.values(BigQueryFieldMode);

  // Handle mode change
  const handleValueChange = (value: string) => {
    if (onModeChange) {
      onModeChange(value as BigQueryFieldMode);
    }
  };

  return (
    <Select value={mode as string} onValueChange={handleValueChange}>
      <SelectTrigger className='group hover:border-input focus-visible:border-ring focus-visible:dark:bg-input/30 w-full border-0 pr-3 pl-0 shadow-none hover:shadow-xs focus-visible:pl-3 focus-visible:shadow-xs dark:bg-transparent [&_svg]:opacity-0 [&_svg]:group-hover:opacity-50 [&_svg]:group-focus-visible:opacity-50'>
        <SelectValue placeholder='Select mode' />
      </SelectTrigger>
      <SelectContent className='max-h-[300px]'>
        {fieldModes.map(fieldMode => (
          <SelectItem key={fieldMode} value={fieldMode}>
            {fieldMode}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
