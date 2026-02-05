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
import { ConfirmationDialog } from '../../../../../../shared/components/ConfirmationDialog/ConfirmationDialog';

interface ConnectorDefinitionFieldProps {
  control: Control<DataMartDefinitionFormData>;
  storageType: DataStorageType;
  preset?: string;
  autoOpen?: boolean;
  saveDataMartDefinition?: (e?: React.SyntheticEvent<HTMLFormElement>) => void;
}

export function ConnectorDefinitionField({
  control,
  storageType,
  preset,
  autoOpen = false,
  saveDataMartDefinition,
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

  const datamartStatus = dataMart?.status ?? DataMartStatus.DRAFT;

  const applyDefinitionAndSave = async (definition: ConnectorDefinitionConfig) => {
    setValue('definition', definition, { shouldDirty: true, shouldTouch: true });
    const isValid = await trigger('definition');
    if (isValid && saveDataMartDefinition) {
      saveDataMartDefinition();
    }
  };

  const setupConnector = async (connector: ConnectorConfig) => {
    const source: ConnectorSourceConfig = connector.source;

    const storage: ConnectorStorageConfig = connector.storage;

    const newDefinition: ConnectorDefinitionConfig = {
      connector: {
        source,
        storage,
      },
    };
    await applyDefinitionAndSave(newDefinition);
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

  const updateConnectorConfiguration =
    (configIndex: number) => async (connector: ConnectorConfig) => {
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
        await applyDefinitionAndSave(updatedDefinition);
      }
    };

  const updateConnectorFields = async (connector: ConnectorConfig) => {
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
      await applyDefinitionAndSave(updatedDefinition);
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
      >
        <Edit3 className='h-4 w-4' />
        <span>Edit Fields ({String(fieldsCount)})</span>
      </Button>
    );
  };

  const [configIndexToDelete, setConfigIndexToDelete] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const confirmDeleteConfiguration = (configIndex: number) => {
    setConfigIndexToDelete(configIndex);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (configIndexToDelete === null) return;
    await removeConfiguration(configIndexToDelete);
    setConfigIndexToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const removeConfiguration = async (configIndex: number) => {
    const currentValues = getValues();
    const currentDefinition = currentValues.definition as ConnectorDefinitionConfig;

    if (
      isConnectorDefinition(currentDefinition) &&
      currentDefinition.connector.source.configuration.length <= 1
    ) {
      const emptyDefinition = getEmptyDefinition(
        DataMartDefinitionType.CONNECTOR
      ) as ConnectorDefinitionConfig;
      await applyDefinitionAndSave(emptyDefinition);
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
      await applyDefinitionAndSave(updatedDefinition);
    }
  };

  const addConfiguration = async (newConfig: Record<string, unknown>) => {
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
      await applyDefinitionAndSave(updatedDefinition);
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
                    onSetupConnector={(connector: ConnectorConfig) => {
                      void setupConnector(connector);
                      setIsSetupSheetOpen(false);
                    }}
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
                          onAddConfiguration={newConfig => void addConfiguration(newConfig)}
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
                        {dataMart?.definitionType === DataMartDefinitionType.CONNECTOR && (
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
                                    onRemoveConfiguration={configIndex => {
                                      confirmDeleteConfiguration(configIndex);
                                    }}
                                    onUpdateConfiguration={configIndex =>
                                      updateConnectorConfiguration(configIndex)
                                    }
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
          onSubmit={connector => void updateConnectorFields(connector)}
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

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete Configuration'
        description='Are you sure you want to delete this configuration? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => {
          setConfigIndexToDelete(null);
        }}
        variant='destructive'
      />
    </>
  );
}
