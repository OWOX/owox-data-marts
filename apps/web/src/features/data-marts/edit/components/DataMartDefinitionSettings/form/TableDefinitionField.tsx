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
import {
  getFullyQualifiedNamePlaceholder,
  getFullyQualifiedNameHelpText,
} from '../../../../shared';

interface TableDefinitionFieldProps {
  control: Control<DataMartDefinitionFormData>;
  storageType: DataStorageType;
}

export function TableDefinitionField({ control, storageType }: TableDefinitionFieldProps) {
  const placeholder = getFullyQualifiedNamePlaceholder(storageType);
  const helpText = getFullyQualifiedNameHelpText(storageType);

  return (
    <FormField
      control={control}
      name='definition.fullyQualifiedName'
      render={({ field }) => (
        <FormItem>
          <FormLabel>Fully Qualified Table Name</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} value={field.value || ''} onChange={field.onChange} />
          </FormControl>
          <FormDescription>{helpText}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
