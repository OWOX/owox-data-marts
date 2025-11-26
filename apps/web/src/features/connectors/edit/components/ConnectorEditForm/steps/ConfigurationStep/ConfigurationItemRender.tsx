import { AppWizardStepLabel, AppWizardStepItem } from '@owox/ui/components/common/wizard';
import { RequiredType, type ConnectorSpecificationResponseApiDto } from '../../../../../shared/api';
import { configurationFieldRender } from './ConfigurationFieldRender';
import { Button } from '@owox/ui/components/button';

interface ConfigurationItemRenderProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  isEditingExisting: boolean;
  isSecret: boolean;
  isSecretEditing: boolean;
  onValueChange: (name: string, value: unknown) => void;
  onSecretEditToggle: (name: string, enable: boolean) => void;
  connectorName: string;
}

export function ConfigurationItemRender({
  specification,
  configuration,
  isEditingExisting,
  isSecretEditing,
  isSecret,
  onValueChange,
  onSecretEditToggle,
  connectorName,
}: ConfigurationItemRenderProps) {
  return (
    <AppWizardStepItem key={specification.name}>
      {specification.requiredType !== RequiredType.BOOLEAN && (
        <div className='flex items-center justify-between'>
          <AppWizardStepLabel
            htmlFor={specification.name}
            required={specification.required}
            tooltip={specification.description}
          >
            {specification.title ?? specification.name}
          </AppWizardStepLabel>
          {isSecret && isEditingExisting && (
            <Button
              variant='ghost'
              size='sm'
              type='button'
              onClick={() => {
                onSecretEditToggle(specification.name, !isSecretEditing);
              }}
            >
              {isSecretEditing ? 'Cancel' : 'Edit'}
            </Button>
          )}
        </div>
      )}

      {configurationFieldRender({
        specification,
        configuration,
        onValueChange: onValueChange,
        flags: {
          isSecret,
          isEditingExisting,
          isSecretEditing,
        },
        connectorName: connectorName,
      })}
    </AppWizardStepItem>
  );
}
