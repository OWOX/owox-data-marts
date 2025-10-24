import { useEffect, useState } from 'react';
import { useFormContext, type Control } from 'react-hook-form';
import toast from 'react-hot-toast';
import { type DataMartDefinitionFormData } from '../../../model/schema/data-mart-definition.schema';
import { FormControl, FormField, FormItem, FormMessage } from '@owox/ui/components/form';
import { Button } from '@owox/ui/components/button';
import { Edit3, Play } from 'lucide-react';
import { DataStorageType } from '../../../../../data-storage';
import {
  type ConnectorDefinitionConfig,
  type ConnectorConfig,
  type ConnectorSourceConfig,
  type ConnectorStorageConfig,
} from '../../../model/types/connector-definition-config';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../model/context/types';
import { DataMartStatus, DataMartDefinitionType } from '../../../../shared/enums';
import { getEmptyDefinition } from '../../../utils/definition-helpers';
import {
  ConnectorSetupButton,
  ConnectorConfigurationItem,
  AddConfigurationButton,
  isConnectorDefinition,
  isConnectorConfigured,
} from '../../../../../connectors/edit/components/ConnectorDefinitionField';
import { ConnectorEditSheet } from '../../../../../connectors/edit/components/ConnectorEditSheet/ConnectorEditSheet';
import { ConnectorContextProvider } from '../../../../../connectors/shared/model/context';
import { ConnectorRunView } from '../../../../../connectors/edit/components/ConnectorRunSheet/ConnectorRunView';
import type { ConnectorRunFormData } from '../../../../../connectors/shared/model/types/connector';

interface ConnectorDefinitionFieldProps {
  control: Control<DataMartDefinitionFormData>;
  storageType: DataStorageType;
  preset?: string;
  autoOpen?: boolean;
}

export function ConnectorDefinitionField({
  control,
  storageType,
  preset,
  autoOpen = false,
}: ConnectorDefinitionFieldProps) {
  const { dataMart, runDataMart } = useOutletContext<DataMartContextType>();
  const { setValue, getValues, trigger } = useFormContext<DataMartDefinitionFormData>();
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isSetupSheetOpen, setIsSetupSheetOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) {
      setIsSetupSheetOpen(true);
    }
  }, [autoOpen]);

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

  const handleManualRun = async (payload: Record<string, unknown>) => {
    if (!dataMart) return;
    if (dataMart.status.code !== DataMartStatus.PUBLISHED) {
      toast.error('Manual run is only available for published data marts');
      return;
    }
    await runDataMart({
      id: dataMart.id,
      payload,
    });
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

  const updateConnectorFields = (connector: ConnectorConfig) => {
    const currentValues = getValues();
    const currentDefinition = currentValues.definition as ConnectorDefinitionConfig;

    if (typeof currentDefinition === 'object' && isConnectorDefinition(currentDefinition)) {
      const updatedDefinition: ConnectorDefinitionConfig = {
        connector: {
          ...currentDefinition.connector,
          source: {
            ...currentDefinition.connector.source,
            fields: connector.source.fields,
          },
        },
      };
      setValue('definition', updatedDefinition, { shouldDirty: true, shouldTouch: true });
      triggerValidation();
    }
    setIsEditSheetOpen(false);
  };

  const onManualRunHandler: (data: ConnectorRunFormData) => void = data => {
    void handleManualRun({ runType: data.runType, data: data.data });
  };

  const renderEditFieldsButton = (connectorDef: ConnectorDefinitionConfig) => {
    const fieldsCount = connectorDef.connector.source.fields.length;
    return (
      <Button
        type='button'
        variant='outline'
        onClick={() => {
          setIsEditSheetOpen(true);
        }}
        className='dm-card-table-add-field-btn cursor-pointer'
      >
        <Edit3 className='h-4 w-4' />
        <span>Edit Fields ({String(fieldsCount)})</span>
      </Button>
    );
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
    <>
      <FormField
        control={control}
        name='definition'
        render={({ field }) => (
          <FormItem className='dark:bg-white/2'>
            <FormControl>
              <div className='space-y-3'>
                {!isConnectorConfigured(field.value as ConnectorDefinitionConfig) ||
                datamartStatus === DataMartStatus.DRAFT ? (
                  <ConnectorSetupButton
                    storageType={storageType}
                    onSetupConnector={setupConnector}
                    preset={preset}
                    isOpen={isSetupSheetOpen}
                    onClose={() => {
                      setIsSetupSheetOpen(false);
                    }}
                  />
                ) : (
                  <div className='space-y-3'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <AddConfigurationButton
                          storageType={storageType}
                          onAddConfiguration={addConfiguration}
                          existingConnector={
                            isConnectorConfigured(field.value as ConnectorDefinitionConfig)
                              ? {
                                  source: (field.value as ConnectorDefinitionConfig).connector
                                    .source,
                                  storage: (field.value as ConnectorDefinitionConfig).connector
                                    .storage,
                                }
                              : undefined
                          }
                        />
                        {isConnectorConfigured(field.value as ConnectorDefinitionConfig) &&
                          renderEditFieldsButton(field.value as ConnectorDefinitionConfig)}
                      </div>
                      <div className='flex items-center gap-2'>
                        {dataMart &&
                          dataMart.definitionType === DataMartDefinitionType.CONNECTOR && (
                            <ConnectorRunView
                              configuration={dataMart.definition as ConnectorDefinitionConfig}
                              onManualRun={onManualRunHandler}
                            >
                              <Button variant='outline'>
                                <Play className='h-4 w-4' />
                                <span>Manual Run...</span>
                              </Button>
                            </ConnectorRunView>
                          )}
                      </div>
                    </div>
                    <div className='space-y-3'>
                      {isConnectorConfigured(field.value as ConnectorDefinitionConfig) &&
                      dataMart?.storage
                        ? (
                            field.value as ConnectorDefinitionConfig
                          ).connector.source.configuration.map(
                            (_: Record<string, unknown>, configIndex: number) => {
                              const connectorDef = field.value as ConnectorDefinitionConfig;
                              return (
                                <ConnectorContextProvider key={configIndex}>
                                  <ConnectorConfigurationItem
                                    key={configIndex}
                                    configIndex={configIndex}
                                    connectorDef={connectorDef}
                                    dataStorage={dataMart.storage}
                                    onRemoveConfiguration={removeConfiguration}
                                    onUpdateConfiguration={updateConnectorConfiguration}
                                    dataMartStatus={
                                      typeof datamartStatus === 'object'
                                        ? datamartStatus.code
                                        : datamartStatus
                                    }
                                    totalConfigurations={
                                      connectorDef.connector.source.configuration.length
                                    }
                                  />
                                </ConnectorContextProvider>
                              );
                            }
                          )
                        : null}
                    </div>
                  </div>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <ConnectorContextProvider>
        <ConnectorEditSheet
          isOpen={isEditSheetOpen}
          onClose={() => {
            setIsEditSheetOpen(false);
          }}
          onSubmit={updateConnectorFields}
          dataStorageType={storageType}
          existingConnector={
            isConnectorConfigured(getValues().definition as ConnectorDefinitionConfig)
              ? {
                  source: (getValues().definition as ConnectorDefinitionConfig).connector.source,
                  storage: (getValues().definition as ConnectorDefinitionConfig).connector.storage,
                }
              : undefined
          }
          mode='fields-only'
        />
      </ConnectorContextProvider>
    </>
  );
}
