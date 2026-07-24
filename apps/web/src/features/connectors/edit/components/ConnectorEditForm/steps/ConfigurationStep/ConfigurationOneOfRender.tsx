import { useState, useEffect, useMemo } from 'react';
import { type ConnectorSpecificationResponseApiDto } from '../../../../../shared/api/types';
import { AppWizardStepItemOneOf } from '@owox/ui/components/common/wizard';
import { TabsContent } from '@owox/ui/components/tabs';
import { OauthRenderFactory } from './Oauth/OauthRenderFactory';
import { NestedConfigurationField } from './NestedConfigurationField';
import { SECRET_MASK } from '../../../../../../../shared/constants/secrets';
import { GoogleSheetsServiceAccountField } from './GoogleSheetsServiceAccountField';

interface ConfigurationOneOfRenderProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  isEditingExisting: boolean;
  connectorName: string;
}

export function ConfigurationOneOfRender({
  specification,
  configuration,
  onValueChange,
  isEditingExisting,
  connectorName,
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
  const [fieldSecretEditing, setFieldSecretEditing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelectedOption(detectSelectedOption);
  }, [detectSelectedOption]);

  // Initialize configuration for selected option on first render
  useEffect(() => {
    if (selectedOption) {
      const configObject = configuration[specification.name];
      const hasSelectedOption =
        configObject && typeof configObject === 'object' && selectedOption in configObject;

      if (!hasSelectedOption) {
        onValueChange(specification.name, {
          [selectedOption]: {},
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOption, specification.name]);

  if (!specification.oneOf) {
    return null;
  }

  const handleTabChange = (value: string) => {
    setSelectedOption(value);
  };

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

  const handleNestedValuesChange = (option: string, values: Record<string, unknown>) => {
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
        ...values,
      },
    });
  };

  const handleFieldSecretEditToggle = (option: string, itemName: string, enable: boolean) => {
    setFieldSecretEditing(prev => ({ ...prev, [itemName]: enable }));
    handleNestedValueChange(option, itemName, enable ? '' : SECRET_MASK);
  };

  return (
    <AppWizardStepItemOneOf
      key={specification.name}
      label={specification.title ?? specification.name}
      options={specification.oneOf.map(option => ({ value: option.value, label: option.label }))}
      value={selectedOption}
      onValueChange={handleTabChange}
    >
      {specification.oneOf.map(option => {
        const isOAuthFlow =
          option.attributes &&
          Array.isArray(option.attributes) &&
          option.attributes.includes('OAUTH_FLOW');

        return (
          <TabsContent key={option.value} value={option.value}>
            {isOAuthFlow ? (
              <OauthRenderFactory
                specification={specification}
                option={option}
                configuration={configuration}
                onValueChange={onValueChange}
                connectorName={connectorName}
                isEditingExisting={isEditingExisting}
              />
            ) : (
              Object.entries(option.items).map(([itemName, itemSpec]) => {
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
                const isGoogleSheetsServiceAccountField =
                  connectorName === 'GoogleSheets' &&
                  specification.name === 'AuthType' &&
                  option.value === 'service_account' &&
                  itemName === 'ServiceAccountKey';

                if (isGoogleSheetsServiceAccountField) {
                  return (
                    <GoogleSheetsServiceAccountField
                      key={itemName}
                      itemName={itemName}
                      title={itemSpec.title}
                      description={itemSpec.description}
                      value={nestedConfiguration[itemName]}
                      metadata={{
                        email:
                          typeof nestedConfiguration.ServiceAccountEmail === 'string'
                            ? nestedConfiguration.ServiceAccountEmail
                            : undefined,
                        clientId:
                          typeof nestedConfiguration.ServiceAccountClientId === 'string'
                            ? nestedConfiguration.ServiceAccountClientId
                            : undefined,
                        projectId:
                          typeof nestedConfiguration.ServiceAccountProjectId === 'string'
                            ? nestedConfiguration.ServiceAccountProjectId
                            : undefined,
                      }}
                      isEditingExisting={isEditingExisting}
                      onValueChange={(value, metadata) => {
                        handleNestedValuesChange(option.value, {
                          [itemName]: value,
                          ServiceAccountEmail: metadata.email ?? '',
                          ServiceAccountClientId: metadata.clientId ?? '',
                          ServiceAccountProjectId: metadata.projectId ?? '',
                        });
                      }}
                    />
                  );
                }

                return (
                  <NestedConfigurationField
                    key={itemName}
                    itemName={itemName}
                    itemSpec={itemSpec}
                    nestedConfiguration={nestedConfiguration}
                    isEditingExisting={isEditingExisting}
                    isSecretEditing={fieldSecretEditing[itemName] ?? false}
                    onSecretEditToggle={(name, enable) => {
                      handleFieldSecretEditToggle(option.value, name, enable);
                    }}
                    onValueChange={(name, value) => {
                      handleNestedValueChange(option.value, name, value);
                    }}
                    connectorName={connectorName}
                  />
                );
              })
            )}
          </TabsContent>
        );
      })}
    </AppWizardStepItemOneOf>
  );
}
