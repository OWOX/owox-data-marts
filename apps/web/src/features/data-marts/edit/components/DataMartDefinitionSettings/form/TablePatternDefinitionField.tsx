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
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@owox/ui/components/input-group';
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
              <InputGroup className='dm-card-formcontrol'>
                <InputGroupAddon align='inline-start'>
                  <FillFromStorageButton
                    storageId={storageId}
                    storageType={storageType}
                    resourceType='TABLE_PATTERN'
                    onSelect={handleSelect}
                    hasValue={Boolean(field.value)}
                  />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder={placeholder}
                  value={field.value}
                  onChange={field.onChange}
                />
                {resourceUrl && (
                  <InputGroupAddon align='inline-end'>
                    <InputGroupButton size='icon-xs' asChild variant='ghost'>
                      <a
                        href={resourceUrl}
                        target='_blank'
                        rel='noopener noreferrer'
                        title='Open in storage console'
                      >
                        <ExternalLink className='!h-3.5 !w-3.5 shrink-0' />
                      </a>
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
            </FormControl>
            <FormDescription className='text-muted-foreground/75'>{helpText}</FormDescription>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
