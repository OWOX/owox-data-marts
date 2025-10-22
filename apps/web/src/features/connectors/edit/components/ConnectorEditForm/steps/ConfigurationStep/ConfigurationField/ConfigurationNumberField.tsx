import { Input } from '@owox/ui/components/input';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';

interface ConfigurationNumberFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
}

export function ConfigurationNumberField({
  specification,
  configuration,
  onValueChange,
}: ConfigurationNumberFieldProps) {
  const { name, placeholder, default: defaultValue } = specification;
  const displayName = specification.title ?? specification.name;
  return (
    <Input
      id={name}
      name={name}
      type='number'
      value={(configuration[name] as string) || (defaultValue as string) || ''}
      placeholder={placeholder ?? `Enter ${displayName.toLowerCase()}`}
      onChange={e => {
        const numValue = parseFloat(e.target.value) || 0;
        onValueChange(name, numValue);
      }}
    />
  );
}
