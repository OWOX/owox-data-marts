import { Input } from '@owox/ui/components/input';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';

interface ConfigurationStringFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
}

export function ConfigurationStringField({
  specification,
  configuration,
  onValueChange,
}: ConfigurationStringFieldProps) {
  const { name, placeholder } = specification;
  const displayName = specification.title ?? specification.name;

  return (
    <Input
      id={name}
      name={name}
      type='text'
      value={(configuration[name] as string) || ''}
      placeholder={placeholder ?? `Enter ${displayName.toLowerCase()}`}
      onChange={e => {
        onValueChange(name, e.target.value);
      }}
    />
  );
}
