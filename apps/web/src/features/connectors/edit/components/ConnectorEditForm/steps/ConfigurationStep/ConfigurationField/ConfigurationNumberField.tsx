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
  const { name, placeholder, minimum, maximum } = specification;
  const displayName = specification.title ?? specification.name;
  const value = configuration[name];
  const inputValue = typeof value === 'number' || typeof value === 'string' ? String(value) : '';

  return (
    <Input
      id={name}
      name={name}
      type='number'
      min={minimum}
      max={maximum}
      value={inputValue}
      placeholder={placeholder ?? `Enter ${displayName.toLowerCase()}`}
      onChange={e => {
        const value = e.target.value;
        const numValue = value === '' ? undefined : parseFloat(value);
        onValueChange(name, numValue);
      }}
    />
  );
}
