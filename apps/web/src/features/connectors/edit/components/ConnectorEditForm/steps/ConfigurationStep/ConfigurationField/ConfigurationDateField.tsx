import { Input } from '@owox/ui/components/input';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';

interface ConfigurationDateFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
}

export function ConfigurationDateField({
  specification,
  configuration,
  onValueChange,
}: ConfigurationDateFieldProps) {
  const { name, placeholder, default: defaultValue } = specification;
  const displayName = specification.title ?? specification.name;

  const parseDateValue = (value: unknown): string => {
    if (!value) return '';
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const dateStr = typeof value === 'string' ? value : value.toString();
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  return (
    <Input
      id={name}
      name={name}
      type='date'
      value={(configuration[name] as string) || parseDateValue(defaultValue) || ''}
      placeholder={placeholder ?? `Enter ${displayName.toLowerCase()}`}
      onChange={e => {
        onValueChange(name, e.target.value);
      }}
    />
  );
}
