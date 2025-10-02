import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { BigQueryFieldMode } from '../../../../../shared/types/data-mart-schema.types';

/**
 * Props for the SchemaFieldModeSelect component
 */
interface SchemaFieldModeSelectProps {
  /** The current mode of the field */
  mode: BigQueryFieldMode;
  /** Callback function to call when the mode changes */
  onModeChange?: (newMode: BigQueryFieldMode) => void;
}

/**
 * Select component for choosing a BigQuery field mode
 */
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
      <SelectTrigger className='h-90 cursor-pointer' size='sm'>
        <SelectValue placeholder='Select field mode' />
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
