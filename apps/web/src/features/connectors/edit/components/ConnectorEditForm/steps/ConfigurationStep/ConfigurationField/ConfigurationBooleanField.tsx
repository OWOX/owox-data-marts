import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';
import { AppWizardStepLabel } from '@owox/ui/components/common/wizard';

interface ConfigurationBooleanFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
}

export function ConfigurationBooleanField({
  specification,
  configuration,
  onValueChange,
}: ConfigurationBooleanFieldProps) {
  const { name, title } = specification;

  const displayName = title ?? name;
  const inputId = name;
  return (
    <div className='flex items-center space-x-2'>
      <Input
        type='checkbox'
        id={inputId}
        name={name}
        checked={(configuration[name] as boolean) || false}
        onChange={e => {
          onValueChange(name, e.target.checked);
        }}
        className='text-primary focus:ring-primary border-border h-4 w-4 rounded'
      />
      <Label htmlFor={inputId} className='cursor-pointer text-sm'>
        <AppWizardStepLabel
          htmlFor={inputId}
          required={specification.required}
          tooltip={specification.description}
        >
          {displayName}
        </AppWizardStepLabel>
      </Label>
    </div>
  );
}
