import { useFormContext, type Control } from 'react-hook-form';
import { type DataMartDefinitionFormData } from '../../../model/schema/data-mart-definition.schema';
import { FormControl, FormField, FormItem, FormMessage } from '@owox/ui/components/form';
import { DataStorageType } from '../../../../../data-storage';
import {
  type ConnectorDefinitionConfig,
  type ConnectorConfig,
  type ConnectorSourceConfig,
  type ConnectorStorageConfig,
} from '../../../model/types/connector-definition-config';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../model/context/types';
import { DataMartStatus } from '../../../../shared/enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../../../../shared/enums/data-mart-definition-type.enum';
import { getEmptyDefinition } from '../../../utils/definition-helpers';
import {
  ConnectorSetupButton,
  ConnectorConfigurationItem,
  AddConfigurationButton,
  isConnectorDefinition,
  isConnectorConfigured,
} from '../../../../../connectors/edit/components/ConnectorDefinitionField';

interface ConnectorDefinitionFieldProps {
  control: Control<DataMartDefinitionFormData>;
  storageType: DataStorageType;
}

export function ConnectorDefinitionField({ control, storageType }: ConnectorDefinitionFieldProps) {
  const { dataMart } = useOutletContext<DataMartContextType>();
  const { setValue, getValues, trigger } = useFormContext<DataMartDefinitionFormData>();

  const triggerValidation = () => {
    setTimeout(() => void trigger('definition'), 0);
  };

  const datamartStatus = dataMart?.status ?? DataMartStatus.DRAFT;

  const setupConnector = (connector: ConnectorConfig) => {
    const source: ConnectorSourceConfig = connector.source;

    const storage: ConnectorStorageConfig = connector.storage;

    const newDefinition: ConnectorDefinitionConfig = {
      connector: {
        source,
        storage,
      },
    };
    setValue('definition', newDefinition, { shouldDirty: true, shouldTouch: true });
    triggerValidation();
  };

  const updateConnectorConfiguration = (configIndex: number) => (connector: ConnectorConfig) => {
    const currentValues = getValues();
    const currentDefinition = currentValues.definition as ConnectorDefinitionConfig;

    if (typeof currentDefinition === 'object' && isConnectorDefinition(currentDefinition)) {
      const updatedConfigurations = [...currentDefinition.connector.source.configuration];
      updatedConfigurations[configIndex] = connector.source.configuration[0] || {};

      const updatedDefinition: ConnectorDefinitionConfig = {
        connector: {
          ...currentDefinition.connector,
          source: {
            ...currentDefinition.connector.source,
            configuration: updatedConfigurations,
          },
        },
      };
      setValue('definition', updatedDefinition, { shouldDirty: true, shouldTouch: true });
      triggerValidation();
    }
  };

  const removeConfiguration = (configIndex: number) => {
    const currentValues = getValues();
    const currentDefinition = currentValues.definition as ConnectorDefinitionConfig;

    if (
      isConnectorDefinition(currentDefinition) &&
      currentDefinition.connector.source.configuration.length <= 1
    ) {
      const emptyDefinition = getEmptyDefinition(
        DataMartDefinitionType.CONNECTOR
      ) as ConnectorDefinitionConfig;
      setValue('definition', emptyDefinition, { shouldDirty: true, shouldTouch: true });
      triggerValidation();
    }

    if (
      typeof currentDefinition === 'object' &&
      isConnectorDefinition(currentDefinition) &&
      currentDefinition.connector.source.configuration.length > 1
    ) {
      const updatedSource: ConnectorSourceConfig = {
        ...currentDefinition.connector.source,
        configuration: currentDefinition.connector.source.configuration.filter(
          (_, index) => index !== configIndex
        ),
      };

      const updatedDefinition: ConnectorDefinitionConfig = {
        connector: {
          ...currentDefinition.connector,
          source: updatedSource,
        },
      };
      setValue('definition', updatedDefinition, { shouldDirty: true, shouldTouch: true });
      triggerValidation();
    }
  };

  const addConfiguration = (newConfig: Record<string, unknown>) => {
    const currentValues = getValues();
    const currentDefinition = currentValues.definition as ConnectorDefinitionConfig;

    if (isConnectorDefinition(currentDefinition)) {
      const updatedSource: ConnectorSourceConfig = {
        ...currentDefinition.connector.source,
        configuration: [...currentDefinition.connector.source.configuration, newConfig],
      };

      const updatedDefinition: ConnectorDefinitionConfig = {
        connector: {
          ...currentDefinition.connector,
          source: updatedSource,
        },
      };
      setValue('definition', updatedDefinition, { shouldDirty: true, shouldTouch: true });
      triggerValidation();
    }
  };

  return (
    <FormField
      control={control}
      name='definition'
      render={({ field }) => (
        <FormItem className='space-y-0'>
          <FormControl>
            <div className='space-y-4'>
              {!isConnectorConfigured(field.value as ConnectorDefinitionConfig) ||
              datamartStatus === DataMartStatus.DRAFT ? (
                <ConnectorSetupButton storageType={storageType} onSetupConnector={setupConnector} />
              ) : (
                <div className='space-y-4'>
                  <div className='text-muted-foreground text-sm font-medium'>Input Source</div>
                  <div className='space-y-3'>
                    {isConnectorConfigured(field.value as ConnectorDefinitionConfig)
                      ? (
                          field.value as ConnectorDefinitionConfig
                        ).connector.source.configuration.map(
                          (_: Record<string, unknown>, configIndex: number) => {
                            const connectorDef = field.value as ConnectorDefinitionConfig;
                            return (
                              <ConnectorConfigurationItem
                                key={configIndex}
                                configIndex={configIndex}
                                connectorDef={connectorDef}
                                storageType={storageType}
                                onRemoveConfiguration={removeConfiguration}
                                onUpdateConfiguration={updateConnectorConfiguration}
                              />
                            );
                          }
                        )
                      : null}

                    <AddConfigurationButton
                      storageType={storageType}
                      onAddConfiguration={addConfiguration}
                    />
                  </div>
                </div>
              )}
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
