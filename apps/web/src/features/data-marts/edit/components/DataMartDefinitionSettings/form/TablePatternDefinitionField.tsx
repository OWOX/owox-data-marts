import { useCallback } from 'react';
import { type Control, useFormContext } from 'react-hook-form';
import { ExternalLink } from 'lucide-react';
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
import type { DataStorageConfigDto } from '../../../../../data-storage/shared/api/types';
import {
  getTablePatternPlaceholder,
  getTablePatternHelpText,
  patternFqnToStored,
} from '../../../../shared';
import { getStorageResourceUrlFromFqn } from '../../../../../data-storage/shared/utils/storage-url.utils';
import { FillFromStorageButton } from './FillFromStorageButton';

interface TablePatternDefinitionFieldProps {
  control: Control<DataMartDefinitionFormData>;
  storageType: DataStorageType;
  storageId: string;
  storageConfig: DataStorageConfigDto | null;
}

export function TablePatternDefinitionField({
  control,
  storageType,
  storageId,
  storageConfig,
}: TablePatternDefinitionFieldProps) {
  const placeholder = getTablePatternPlaceholder(storageType);
  const helpText = getTablePatternHelpText(storageType);
  const { setValue } = useFormContext<DataMartDefinitionFormData>();

  const handleSelect = useCallback(
    (fqn: string) => {
      // Wildcard rollups arrive as `prefix_*`, but the stored TABLE_PATTERN convention is the
      // bare prefix (the BigQuery query builder appends `*` itself at query time). Strip here
      // so the input matches what gets persisted.
      setValue('definition.pattern', patternFqnToStored(fqn), {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [setValue]
  );

  return (
    <FormField
      control={control}
      name='definition.pattern'
      render={({ field }) => {
        const resourceUrl = field.value
          ? getStorageResourceUrlFromFqn(storageType, storageConfig, field.value)
          : null;

        return (
          <FormItem className='dm-card-block'>
            <FormLabel>Table Pattern</FormLabel>
            <FormControl>
              <div className='flex items-center gap-2'>
                <FillFromStorageButton
                  storageId={storageId}
                  storageType={storageType}
                  resourceType='TABLE_PATTERN'
                  onSelect={handleSelect}
                />
                <Input
                  placeholder={placeholder}
                  value={field.value}
                  onChange={field.onChange}
                  className='dm-card-formcontrol'
                />
                {resourceUrl && (
                  <a
                    href={resourceUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    title='Open in storage console'
                    className='text-muted-foreground hover:text-primary shrink-0 p-1.5 transition-colors'
                  >
                    <ExternalLink className='h-4 w-4' />
                  </a>
                )}
              </div>
            </FormControl>
            <FormDescription className='text-muted-foreground/75'>{helpText}</FormDescription>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
