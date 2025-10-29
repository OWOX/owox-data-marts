import { Input } from '@owox/ui/components/input';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';
import { SECRET_MASK } from '../../../../../../../../shared/constants/secrets';
import type { ChangeEvent } from 'react';

interface ConfigurationSecretFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  isEditingExisting: boolean;
  isSecretEditing: boolean;
}

export function ConfigurationSecretField({
  specification,
  configuration,
  onValueChange,
  isEditingExisting,
  isSecretEditing,
}: ConfigurationSecretFieldProps) {
  const displayName = specification.title ?? specification.name;
  const isReadonly = isEditingExisting && !isSecretEditing;

  return (
    <Input
      id={specification.name}
      {...(!isReadonly ? { name: specification.name } : {})}
      type={isReadonly ? 'password' : 'text'}
      autoComplete={isReadonly ? 'new-password' : 'off'}
      autoCorrect='off'
      autoCapitalize='off'
      spellCheck={false}
      value={isReadonly ? SECRET_MASK : (configuration[specification.name] as string) || ''}
      {...(isReadonly ? { readOnly: true, disabled: true } : {})}
      {...(!isReadonly
        ? { placeholder: specification.placeholder ?? `Enter ${displayName.toLowerCase()}` }
        : {})}
      {...(!isReadonly
        ? {
            onChange: (e: ChangeEvent<HTMLInputElement>) => {
              onValueChange(specification.name, e.target.value);
            },
          }
        : {})}
    />
  );
}
