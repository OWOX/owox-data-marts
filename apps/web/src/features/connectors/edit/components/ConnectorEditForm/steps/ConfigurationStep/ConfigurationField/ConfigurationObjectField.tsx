import { Textarea } from '@owox/ui/components/textarea';
import { type ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';

interface ConfigurationObjectFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
}

export function ConfigurationObjectField({
  specification,
  configuration,
  onValueChange,
}: ConfigurationObjectFieldProps) {
  const displayName = specification.title ?? specification.name;
  const { name, placeholder, default: defaultValue } = specification;

  return (
    <Textarea
      id={name}
      name={name}
      value={
        configuration[name] && typeof configuration[name] === 'object'
          ? JSON.stringify(configuration[name], null, 2)
          : typeof defaultValue === 'object'
            ? JSON.stringify(defaultValue, null, 2)
            : ''
      }
      placeholder={placeholder ?? `Enter ${displayName.toLowerCase()} as JSON`}
      rows={6}
      className='font-mono'
      onChange={e => {
        try {
          const objectValue = JSON.parse(e.target.value) as Record<string, unknown>;
          onValueChange(name, objectValue);
        } catch {
          onValueChange(name, e.target.value);
        }
      }}
    />
  );
}
