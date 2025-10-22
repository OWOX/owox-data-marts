import { useState, useEffect, useMemo } from 'react';
import { type ConnectorSpecificationResponseApiDto } from '../../../../../shared/api/types';
import { AppWizardStepItemOneOf, AppWizardStepLabel } from '@owox/ui/components/common/wizard';
import { configurationFieldRender } from './ConigurationFieldRender';
import { TabsContent } from '@owox/ui/components/tabs';
import { Button } from '@owox/ui/components/button';

interface ConfigurationOneOfRenderProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  isEditingExisting: boolean;
  isSecretEditing: boolean;
  onSecretEditToggle: (name: string, enable: boolean) => void;
}

export function ConfigurationOneOfRender({
  specification,
  configuration,
  onValueChange,
  isEditingExisting,
  isSecretEditing,
  onSecretEditToggle,
}: ConfigurationOneOfRenderProps) {
  const detectSelectedOption = useMemo(() => {
    const configObject = configuration[specification.name];
    if (configObject && typeof configObject === 'object') {
      const keys = Object.keys(configObject);
      if (keys.length > 0) {
        return keys[0];
      }
    }
    return specification.oneOf?.[0]?.value ?? '';
  }, [configuration, specification.name, specification.oneOf]);

  const [selectedOption, setSelectedOption] = useState(detectSelectedOption);

  useEffect(() => {
    setSelectedOption(detectSelectedOption);
  }, [detectSelectedOption]);

  if (!specification.oneOf) {
    return null;
  }

  const handleNestedValueChange = (option: string, itemName: string, value: unknown) => {
    const currentObjectValue = (
      configuration[specification.name] && typeof configuration[specification.name] === 'object'
        ? configuration[specification.name]
        : {}
    ) as Record<string, unknown>;
    onValueChange(specification.name, {
      [option]: {
        ...(typeof currentObjectValue[option] === 'object' && currentObjectValue[option] !== null
          ? (currentObjectValue[option] as Record<string, unknown>)
          : {}),
        [itemName]: value,
      },
    });
  };

  return (
    <AppWizardStepItemOneOf
      key={specification.name}
      label={specification.title ?? specification.name}
      options={specification.oneOf.map(option => ({ value: option.value, label: option.label }))}
      value={selectedOption}
      onValueChange={setSelectedOption}
    >
      {specification.oneOf.map(option => {
        return (
          <TabsContent key={option.value} value={option.value}>
            {Object.entries(option.items).map(([itemName, itemSpec]) => {
              const currentObjectValue = (
                configuration[specification.name] &&
                typeof configuration[specification.name] === 'object'
                  ? configuration[specification.name]
                  : {}
              ) as Record<string, unknown>;
              const isSecret =
                Array.isArray(itemSpec.attributes) &&
                Object.keys(currentObjectValue)[0] === option.value
                  ? itemSpec.attributes.includes('SECRET')
                  : false;
              const optionConfiguration =
                typeof configuration[specification.name] === 'object' &&
                configuration[specification.name] !== null
                  ? (configuration[specification.name] as Record<string, unknown>)
                  : {};
              const nestedConfiguration =
                typeof optionConfiguration[option.value] === 'object' &&
                optionConfiguration[option.value] !== null
                  ? (optionConfiguration[option.value] as Record<string, unknown>)
                  : {};
              return (
                <div key={itemName} className='mb-4'>
                  <div className='flex items-center justify-between'>
                    <AppWizardStepLabel
                      htmlFor={itemName}
                      required={itemSpec.required}
                      tooltip={itemSpec.description}
                      className='mb-2 justify-start'
                    >
                      {itemName}
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
                  {configurationFieldRender({
                    specification: { ...itemSpec, name: itemName },
                    configuration: nestedConfiguration,
                    onValueChange: (name, value) => {
                      handleNestedValueChange(option.value, name, value);
                    },
                    flags: {
                      isEditingExisting: isEditingExisting,
                      isSecret: isSecret,
                      isSecretEditing: isSecretEditing,
                    },
                  })}
                </div>
              );
            })}
          </TabsContent>
        );
      })}
    </AppWizardStepItemOneOf>
  );
}
