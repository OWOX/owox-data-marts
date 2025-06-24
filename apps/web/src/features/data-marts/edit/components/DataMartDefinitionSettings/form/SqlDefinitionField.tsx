import type { Control } from 'react-hook-form';
import { type DataMartDefinitionFormData } from '../../../model/schema/data-mart-definition.schema.ts';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@owox/ui/components/form';
import { DataMartCodeEditor } from './DataMartCodeEditor.tsx';

interface SqlDefinitionFieldProps {
  control: Control<DataMartDefinitionFormData>;
}

export function SqlDefinitionField({ control }: SqlDefinitionFieldProps) {
  return (
    <FormField
      control={control}
      name='definition.sqlQuery'
      render={({ field }) => (
        <FormItem>
          <FormLabel>SQL Query</FormLabel>
          <FormControl>
            <DataMartCodeEditor
              initialValue={{ sqlQuery: field.value }}
              onChange={config => {
                field.onChange(config.sqlQuery);
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
