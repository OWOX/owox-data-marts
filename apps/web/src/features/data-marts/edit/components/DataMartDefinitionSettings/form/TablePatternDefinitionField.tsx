import { type Control } from 'react-hook-form';
import { type DataMartDefinitionFormData } from '../../../model/schema/data-mart-definition.schema.ts';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { DataStorageType } from '../../../../../data-storage';
import { getTablePatternPlaceholder, getTablePatternHelpText } from '../../../../shared';

interface TablePatternDefinitionFieldProps {
  control: Control<DataMartDefinitionFormData>;
  storageType: DataStorageType;
}

export function TablePatternDefinitionField({
  control,
  storageType,
}: TablePatternDefinitionFieldProps) {
  const placeholder = getTablePatternPlaceholder(storageType);
  const helpText = getTablePatternHelpText(storageType);

  return (
    <FormField
      control={control}
      name='definition.pattern'
      render={({ field }) => (
        <FormItem className='dm-card-block'>
          <FormLabel className='text-foreground'>Table Pattern</FormLabel>
          <FormControl>
            <Input
              placeholder={placeholder}
              value={field.value || ''}
              onChange={field.onChange}
              className='dm-card-formcontrol'
            />
          </FormControl>
          <FormDescription className='text-muted-foreground/50'>{helpText}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
