import type { Control } from 'react-hook-form';
import { type DataMartDefinitionFormData } from '../../../model/schema/data-mart-definition.schema.ts';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@owox/ui/components/form';
import { DataMartCodeEditor } from './DataMartCodeEditor.tsx';
import type { SqlReferencesContext } from './SqlDataMartReferencePicker.tsx';

interface SqlDefinitionFieldProps {
  control: Control<DataMartDefinitionFormData>;
  /** Lets the query reference other Data Marts; absent where references are not supported. */
  references?: SqlReferencesContext;
}

export function SqlDefinitionField({ control, references }: SqlDefinitionFieldProps) {
  return (
    <FormField
      control={control}
      name='definition.sqlQuery'
      render={({ field }) => (
        <FormItem className='dm-card-block'>
          <FormLabel className='text-foreground'>SQL Query</FormLabel>
          <FormControl>
            <DataMartCodeEditor
              value={{ sqlQuery: field.value }}
              onChange={config => {
                field.onChange(config.sqlQuery);
              }}
              references={references}
            />
          </FormControl>
          {references && (
            <p className='text-muted-foreground text-xs'>
              Type @ to reference a published Data Mart from {references.storageTitle}.
            </p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
