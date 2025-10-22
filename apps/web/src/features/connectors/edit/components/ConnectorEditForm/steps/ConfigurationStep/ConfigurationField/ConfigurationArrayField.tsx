import { Textarea } from '@owox/ui/components/textarea';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';

interface ConfigurationArrayFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
}

export function ConfigurationArrayField({
  specification,
  configuration,
  onValueChange,
}: ConfigurationArrayFieldProps) {
  const { name, placeholder, default: defaultValue } = specification;
  const displayName = specification.title ?? specification.name;
  return (
    <Textarea
      id={name}
      name={name}
      value={
        Array.isArray(configuration[name])
          ? (configuration[name] as string[]).join('\n')
          : Array.isArray(defaultValue)
            ? defaultValue.join('\n')
            : ''
      }
      placeholder={placeholder ?? `Enter ${displayName.toLowerCase()} (one per line)`}
      rows={4}
      onChange={e => {
        const arrayValue = e.target.value.split('\n').filter(line => line.trim());
        onValueChange(name, arrayValue);
      }}
    />
  );
}
