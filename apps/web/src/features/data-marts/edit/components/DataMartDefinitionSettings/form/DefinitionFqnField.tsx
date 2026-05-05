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
              <InputGroup className='dm-card-formcontrol'>
                <InputGroupAddon align='inline-start'>
                  <FillFromStorageButton
                    storageId={storageId}
                    storageType={storageType}
                    resourceType={resourceType}
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
