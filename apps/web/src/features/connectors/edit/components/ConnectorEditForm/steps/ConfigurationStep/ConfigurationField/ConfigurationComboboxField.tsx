import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types/index.ts';
import { Combobox } from '../../../../../../../../shared/components/Combobox/combobox.tsx';

interface ConfigurationComboboxFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  specOptions: string[];
}

export function ConfigurationComboboxField({
  specification,
  configuration,
  onValueChange,
  specOptions,
}: ConfigurationComboboxFieldProps) {
  const { name, placeholder, default: defaultValue } = specification;
  const displayName = specification.title ?? specification.name;

  const comboboxOptions = specOptions.map((option: string) => ({
    value: option,
    label: option,
  }));

  return (
    <Combobox
      options={comboboxOptions}
      value={(configuration[name] as string) || (defaultValue as string) || ''}
      onValueChange={(value: string) => {
        onValueChange(name, value);
      }}
      placeholder={placeholder ?? `Select ${displayName.toLowerCase()}`}
      emptyMessage='No options available'
      className='w-full'
    />
  );
}
