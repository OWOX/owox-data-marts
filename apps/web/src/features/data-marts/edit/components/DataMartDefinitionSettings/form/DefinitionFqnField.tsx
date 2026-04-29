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
  getFullyQualifiedNamePlaceholder,
  getFullyQualifiedNameHelpText,
} from '../../../../shared';
import { getStorageResourceUrlFromFqn } from '../../../../../data-storage/shared/utils/storage-url.utils';
import { FillFromStorageButton } from './FillFromStorageButton';
import type { StorageResourceFilter } from '../../../../../data-storage/shared/api/types';

interface DefinitionFqnFieldProps {
  control: Control<DataMartDefinitionFormData>;
  storageType: DataStorageType;
  storageId: string;
  storageConfig: DataStorageConfigDto | null;
  /** Controls the label text and the resource type shown in the picker. */
  mode: 'TABLE' | 'VIEW';
}

export function DefinitionFqnField({
  control,
  storageType,
  storageId,
  storageConfig,
  mode,
}: DefinitionFqnFieldProps) {
  const placeholder = getFullyQualifiedNamePlaceholder(storageType);
  const helpText = getFullyQualifiedNameHelpText(storageType);
  const { setValue } = useFormContext<DataMartDefinitionFormData>();

  const label = mode === 'TABLE' ? 'Fully Qualified Table Name' : 'Fully Qualified View Name';
  const resourceType: StorageResourceFilter = mode;

  const handleSelect = useCallback(
    (fqn: string) => {
      setValue('definition.fullyQualifiedName', fqn, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [setValue]
  );

  return (
    <FormField
      control={control}
      name='definition.fullyQualifiedName'
      render={({ field }) => {
        const resourceUrl = field.value
          ? getStorageResourceUrlFromFqn(storageType, storageConfig, field.value)
          : null;

        return (
          <FormItem className='dm-card-block'>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <div className='flex items-center gap-2'>
                <FillFromStorageButton
                  storageId={storageId}
                  storageType={storageType}
                  resourceType={resourceType}
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
