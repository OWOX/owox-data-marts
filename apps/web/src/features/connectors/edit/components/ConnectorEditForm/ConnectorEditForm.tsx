import { useConnector } from '../../../shared/model/hooks/useConnector';
import type { ConnectorListItem } from '../../../shared/model/types/connector';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { DataStorageType } from '../../../../data-storage';
import {
  ConnectorSelectionStep,
  ConfigurationStep,
  NodesSelectionStep,
  FieldsSelectionStep,
  TargetSetupStep,
} from './steps';
import { StepNavigation } from './components';
import type { ConnectorConfig } from '../../../../data-marts/edit';
import type { ConnectorFieldsResponseApiDto } from '../../../shared/api';
import {
  AppWizard,
  AppWizardLayout,
  AppWizardActions,
  AppWizardStepLoading,
} from '@owox/ui/components/common/wizard';
import { trackEvent } from '../../../../../utils';
import { resolveEffectiveDataLevel } from '../../../shared/constants/connector-config';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import { RefreshCw } from 'lucide-react';
import { extractApiError } from '../../../../../app/api/extract-api-error.util';
import {
  GOOGLE_SHEETS_CONNECTOR_NAME,
  getAvailableGoogleSheetsSelectedFields,
  getGoogleSheetsSelectedColumns,
  isGoogleSheetsImportAllColumnsEnabled,
  isGoogleSheetsSystemField,
  resolveGoogleSheetsPreviewSelection,
  withoutGoogleSheetsSystemFields,
  withGoogleSheetsImportAllColumns,
} from '../../../shared/utils/google-sheets-fields.utils';

interface ConnectorEditFormProps {
  onSubmit: (connector: ConnectorConfig) => void;
  dataStorageType: DataStorageType;
  configurationOnly?: boolean;
  existingConnector?: ConnectorConfig | null;
  mode?: 'full' | 'configuration-only' | 'fields-only';
  initialStep?: number;
  preselectedConnector?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  isOpen?: boolean;
}

export function ConnectorEditForm({
  onSubmit,
  dataStorageType,
  configurationOnly = false,
  existingConnector = null,
  mode = 'full',
  initialStep,
  preselectedConnector,
  onDirtyChange,
  isOpen = true,
}: ConnectorEditFormProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<ConnectorListItem | null>(null);
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [connectorConfiguration, setConnectorConfiguration] = useState<Record<string, unknown>>({});
  const [configurationIsValid, setConfigurationIsValid] = useState<boolean>(false);
  const [loadedSpecifications, setLoadedSpecifications] = useState<Set<string>>(new Set());
  const [loadedFields, setLoadedFields] = useState<Set<string>>(new Set());
  const [previewConfigurationKey, setPreviewConfigurationKey] = useState<string | null>(null);
  const [autoSelectPreviewDefaults, setAutoSelectPreviewDefaults] = useState(true);
  const [fieldsOnlyPreviewError, setFieldsOnlyPreviewError] = useState<string | null>(null);
  const fieldsOnlyPreviewStartedForOpenRef = useRef(false);
  const {
    connectors,
    connectorSpecification,
    connectorFields,
    loading,
    loadingSpecification,
    loadingFields,
    error,
    fetchAvailableConnectors,
    fetchConnectorSpecification,
    fetchConnectorFields,
    previewConnectorFields,
  } = useConnector();

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const [target, setTarget] = useState<{ fullyQualifiedName: string; isValid: boolean } | null>(
    null
  );
  const isGoogleSheetsConnector = selectedConnector?.name === GOOGLE_SHEETS_CONNECTOR_NAME;
  const currentConfigurationKey = useMemo(
    () => JSON.stringify(connectorConfiguration),
    [connectorConfiguration]
  );

  const steps = useMemo(() => {
    if (configurationOnly) {
      return [{ id: 1, title: 'Configuration', description: 'Set up connector parameters' }];
    }

    if (mode === 'fields-only') {
      return [{ id: 1, title: 'Select Fields', description: 'Pick specific fields' }];
    }

    if (isGoogleSheetsConnector) {
      return [
        { id: 1, title: 'Select Connector', description: 'Choose a data source' },
        { id: 2, title: 'Configuration', description: 'Set up connector parameters' },
        { id: 3, title: 'Select Columns', description: 'Pick sheet columns' },
        { id: 4, title: 'Target Setup', description: 'Configure destination' },
      ];
    }

    return [
      { id: 1, title: 'Select Connector', description: 'Choose a data source' },
      { id: 2, title: 'Configuration', description: 'Set up connector parameters' },
      { id: 3, title: 'Select Nodes', description: 'Choose data nodes' },
      { id: 4, title: 'Select Fields', description: 'Pick specific fields' },
      { id: 5, title: 'Target Setup', description: 'Configure destination' },
    ];
  }, [configurationOnly, isGoogleSheetsConnector, mode]);

  const totalSteps = steps.length;

  const loadSpecificationSafely = useCallback(
    async (connectorName: string) => {
      if (!loadedSpecifications.has(connectorName) && !loadingSpecification) {
        setLoadedSpecifications(prev => new Set(prev).add(connectorName));
        await fetchConnectorSpecification(connectorName);
      }
    },
    [loadedSpecifications, loadingSpecification, fetchConnectorSpecification]
  );

  const loadFieldsSafely = useCallback(
    async (connectorName: string) => {
      if (!loadedFields.has(connectorName)) {
        setLoadedFields(prev => new Set(prev).add(connectorName));
        await fetchConnectorFields(connectorName);
      }
    },
    [loadedFields, fetchConnectorFields]
  );

  useEffect(() => {
    if (!preselectedConnector) return;
    if (selectedConnector) return;
    if (connectors.length === 0) return;

    const found = connectors.find(c => c.name === preselectedConnector);
    if (found) {
      setSelectedConnector(found);
      // set default configuration if existing connector wasn't provided
      // ssetConnectorConfiguration(found ? {} : {});
      // set step to requested initialStep (or 2 by default)
      setCurrentStep(initialStep ?? 2);
      // if in full flow ensure fields/spec are loaded:
      void loadSpecificationSafely(found.name);
      if (
        !configurationOnly &&
        mode !== 'fields-only' &&
        found.name !== GOOGLE_SHEETS_CONNECTOR_NAME
      ) {
        void loadFieldsSafely(found.name);
      }
    }
  }, [
    preselectedConnector,
    connectors,
    selectedConnector,
    initialStep,
    configurationOnly,
    mode,
    loadSpecificationSafely,
    loadFieldsSafely,
  ]);

  // Regular modes initialization
  useEffect(() => {
    // Load connectors if needed
    if (connectors.length === 0 && !loading) {
      void fetchAvailableConnectors();
    }

    // Setup existing connector
    if (existingConnector && connectors.length > 0 && !selectedConnector) {
      const { source, storage } = existingConnector;

      setSelectedNode(source.node);
      setSelectedFields(source.fields);
      setConnectorConfiguration(source.configuration[0] || {});
      setTarget({ fullyQualifiedName: storage.fullyQualifiedName, isValid: true });

      const existingConnectorDef = connectors.find(c => c.name === source.name);
      if (existingConnectorDef) {
        setSelectedConnector(existingConnectorDef);

        void loadSpecificationSafely(existingConnectorDef.name);
        if (existingConnectorDef.name !== GOOGLE_SHEETS_CONNECTOR_NAME) {
          // Fields power both the Fields step and the data-level reconciliation at save.
          void loadFieldsSafely(existingConnectorDef.name);
        }
      }
    }

    // Configuration-only mode setup
    if (configurationOnly && connectors.length > 0 && !selectedConnector && !existingConnector) {
      const firstConnector = connectors[0];
      setSelectedConnector(firstConnector);
      void loadSpecificationSafely(firstConnector.name);
    }
  }, [
    mode,
    existingConnector,
    connectors,
    configurationOnly,
    loading,
    fetchAvailableConnectors,
    loadSpecificationSafely,
    loadFieldsSafely,
    selectedConnector,
  ]);

  const effectiveDataLevel = useMemo(
    () => resolveEffectiveDataLevel(connectorConfiguration, connectorSpecification),
    [connectorConfiguration, connectorSpecification]
  );

  // Union the persisted fields with whatever the effective DataLevel requires (e.g. TikTok
  // ad_insights needs ad_id at AUCTION_AD). No-op for nodes without uniqueKeysByDataLevel.
  // Falls back to the unchanged fields if connectorFields hasn't loaded yet, but that
  // window isn't user-reachable: loadFieldsSafely is always triggered for an existing
  // connector, and the Save button is disabled via isLoading={... || loadingFields} at
  // the <StepNavigation> call site below until that fetch settles.
  const fieldsForSave = useMemo(() => {
    const fields = existingConnector?.source.fields ?? selectedFields;
    if (!effectiveDataLevel) return fields;

    const node = existingConnector?.source.node ?? selectedNode;
    const required = connectorFields?.find(f => f.name === node)?.uniqueKeysByDataLevel?.[
      effectiveDataLevel
    ];
    return required?.length ? Array.from(new Set([...fields, ...required])) : fields;
  }, [existingConnector, selectedFields, selectedNode, effectiveDataLevel, connectorFields]);

  const handleConnectorSelect = (connector: ConnectorListItem) => {
    setSelectedConnector(connector);
    setConnectorConfiguration({});
    setConfigurationIsValid(false);
    if (
      connector.name === GOOGLE_SHEETS_CONNECTOR_NAME ||
      selectedConnector?.name === GOOGLE_SHEETS_CONNECTOR_NAME
    ) {
      setSelectedNode('');
      setSelectedFields([]);
    }
    setIsDirty(true);
    setLoadedSpecifications(prev => {
      const newSet = new Set(prev);
      newSet.delete(connector.name);
      return newSet;
    });
    void loadSpecificationSafely(connector.name);
    if (connector.name !== GOOGLE_SHEETS_CONNECTOR_NAME) {
      void loadFieldsSafely(connector.name);
    }
  };

  const handleFieldSelect = (fieldName: string) => {
    setSelectedNode(fieldName);
    setSelectedFields([]);
    setIsDirty(true);
  };

  const handleFieldToggle = (fieldName: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedFields(prev => (prev.includes(fieldName) ? prev : [...prev, fieldName]));
    } else {
      setSelectedFields(prev => prev.filter(f => f !== fieldName));
    }
    setIsDirty(true);
  };

  const handleSelectAllFields = (fieldNames: string[], isSelected: boolean) => {
    if (isSelected) {
      setSelectedFields(prev => {
        const newFields = fieldNames.filter(fieldName => !prev.includes(fieldName));
        return [...prev, ...newFields];
      });
    } else {
      setSelectedFields(prev => prev.filter(fieldName => !fieldNames.includes(fieldName)));
    }
    setIsDirty(true);
  };

  const handleTargetChange = (
    newTarget: { fullyQualifiedName: string; isValid: boolean } | null
  ) => {
    setTarget(newTarget);
    setIsDirty(true);
  };

  // Stores the object by reference on purpose, and `initialConfiguration` hands that
  // same reference back to ConfigurationStep. That step compares it against the last
  // value it reported (see its `lastEchoedConfigRef`) to tell its own echo apart from
  // a genuine outside change, and skips re-seeding the form on an echo.
  // Do not clone or normalise here (`{ ...configuration }`, structuredClone, etc.):
  // every echo would become a new reference, the step would re-seed on each keystroke,
  // and typed characters would be dropped again.
  const handleConfigurationChange = useCallback(
    (configuration: Record<string, unknown>) => {
      setConnectorConfiguration(configuration);
      if (isGoogleSheetsConnector) {
        setPreviewConfigurationKey(null);
      }
      setIsDirty(true);
    },
    [isGoogleSheetsConnector]
  );

  const handleConfigurationValidationChange = useCallback((isValid: boolean) => {
    setConfigurationIsValid(isValid);
  }, []);

  useEffect(() => {
    if (connectorSpecification) {
      const hasRequiredFields = connectorSpecification.some(
        spec => spec.required && spec.name !== 'Fields'
      );
      if (!hasRequiredFields) {
        setConfigurationIsValid(true);
      }
    }
  }, [connectorSpecification]);

  useEffect(() => {
    const step = steps[currentStep - 1];
    if (selectedConnector) {
      trackEvent({
        event: 'connector_setup',
        category: selectedConnector.name,
        action: `step`,
        label: step.title,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);
  const loadGoogleSheetsPreviewFields = useCallback(
    async (options?: {
      connectorName?: string;
      configuration?: Record<string, unknown>;
      selectedFields?: string[];
    }) => {
      const connectorName = options?.connectorName ?? selectedConnector?.name;
      if (connectorName !== GOOGLE_SHEETS_CONNECTOR_NAME) {
        return false;
      }

      const configuration = options?.configuration ?? connectorConfiguration;
      const configurationKey = JSON.stringify(configuration);
      setPreviewConfigurationKey(null);
      setFieldsOnlyPreviewError(null);

      try {
        const previewFields = await previewConnectorFields(connectorName, configuration);
        if (!previewFields) {
          if (mode === 'fields-only') {
            setFieldsOnlyPreviewError('Failed to load Google Sheets columns');
          }
          return false;
        }
        if (previewFields.length === 0) {
          throw new Error('No columns were found in the selected Google Sheets tab');
        }

        const sheetNode = previewFields[0];
        const availableFieldNames = sheetNode.fields?.map(field => field.name) ?? [];
        const availableUserFieldNames = withoutGoogleSheetsSystemFields(availableFieldNames);
        const defaultFields = (
          sheetNode.defaultFields?.length ? sheetNode.defaultFields : availableFieldNames
        ).filter(fieldName => availableFieldNames.includes(fieldName));

        if (availableUserFieldNames.length === 0) {
          throw new Error('No columns were found in the selected Google Sheets tab');
        }

        const persistedColumnSelection = isGoogleSheetsImportAllColumnsEnabled(configuration)
          ? []
          : getGoogleSheetsSelectedColumns(configuration);
        const selectedFieldsToPreserve =
          persistedColumnSelection.length > 0
            ? persistedColumnSelection
            : (options?.selectedFields ?? selectedFields);
        const hasPreviousSelection = selectedFieldsToPreserve.length > 0;
        const nextSelectedFields = resolveGoogleSheetsPreviewSelection(
          configuration,
          options?.selectedFields ?? selectedFields,
          availableFieldNames,
          defaultFields
        );

        setSelectedNode(sheetNode.name);
        setSelectedFields(nextSelectedFields);
        setAutoSelectPreviewDefaults(!hasPreviousSelection);
        setPreviewConfigurationKey(configurationKey);

        return true;
      } catch (error) {
        const apiError = extractApiError(error) as { message?: string } | undefined;
        const message =
          apiError?.message ??
          (error instanceof Error ? error.message : 'Failed to load Google Sheets columns');
        if (mode === 'fields-only') {
          setFieldsOnlyPreviewError(message);
        }
        if (!apiError) {
          toast.error(message);
        }
        return false;
      }
    },
    [connectorConfiguration, mode, previewConnectorFields, selectedConnector?.name, selectedFields]
  );

  useEffect(() => {
    if (!isOpen) {
      fieldsOnlyPreviewStartedForOpenRef.current = false;
      setFieldsOnlyPreviewError(null);
      return;
    }

    if (mode !== 'fields-only') {
      return;
    }

    if (!existingConnector || selectedConnector?.name !== GOOGLE_SHEETS_CONNECTOR_NAME) {
      return;
    }

    if (fieldsOnlyPreviewStartedForOpenRef.current) return;
    fieldsOnlyPreviewStartedForOpenRef.current = true;

    void loadGoogleSheetsPreviewFields({
      connectorName: existingConnector.source.name,
      configuration: existingConnector.source.configuration[0] || {},
      selectedFields: existingConnector.source.fields,
    });
  }, [existingConnector, isOpen, loadGoogleSheetsPreviewFields, mode, selectedConnector?.name]);

  const handleNext = async () => {
    if (isGoogleSheetsConnector && currentStep === 2) {
      const loadedPreview = await loadGoogleSheetsPreviewFields();
      if (!loadedPreview) {
        return;
      }
    }

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canGoNext = () => {
    if (configurationOnly) {
      return selectedConnector !== null && configurationIsValid;
    }

    if (mode === 'fields-only') {
      switch (currentStep) {
        case 1:
          if (isGoogleSheetsConnector) {
            const hasPreviewedSheetColumns = connectorFields?.some(field => {
              return (
                field.name === selectedNode &&
                field.fields?.some(sheetField => !isGoogleSheetsSystemField(sheetField.name))
              );
            });

            return (
              previewConfigurationKey === currentConfigurationKey &&
              Boolean(hasPreviewedSheetColumns) &&
              selectedFields.some(fieldName => !isGoogleSheetsSystemField(fieldName))
            );
          }

          return selectedFields.length > 0;
        default:
          return false;
      }
    }

    switch (currentStep) {
      case 1:
        return selectedConnector !== null;
      case 2:
        return configurationIsValid;
      case 3:
        if (isGoogleSheetsConnector) {
          return (
            previewConfigurationKey === currentConfigurationKey &&
            selectedNode !== '' &&
            selectedFields.some(fieldName => !isGoogleSheetsSystemField(fieldName))
          );
        }
        return selectedNode !== '';
      case 4:
        if (isGoogleSheetsConnector) {
          return target !== null && target.fullyQualifiedName !== '' && target.isValid;
        }
        return selectedFields.length > 0;
      case 5:
        return target !== null && target.fullyQualifiedName !== '' && target.isValid;
      default:
        return false;
    }
  };

  const canGoBack = () => {
    return currentStep > 1;
  };

  const getDestinationName = (
    connectorFields: ConnectorFieldsResponseApiDto[] | null,
    selectedNode: string
  ): string => {
    if (!connectorFields) return selectedNode;

    const field = connectorFields.find(field => field.name === selectedNode);
    return field?.destinationName ?? selectedNode;
  };

  const renderCurrentStep = () => {
    if (configurationOnly && currentStep === 1) {
      return connectorSpecification && selectedConnector ? (
        <ConfigurationStep
          connector={selectedConnector}
          connectorSpecification={connectorSpecification}
          onConfigurationChange={handleConfigurationChange}
          onValidationChange={handleConfigurationValidationChange}
          initialConfiguration={connectorConfiguration}
          loading={loadingSpecification}
          isEditingExisting={Boolean(existingConnector?.source.configuration.length)}
          disabled={isGoogleSheetsConnector && loadingFields}
        />
      ) : null;
    }

    if (mode === 'fields-only') {
      switch (currentStep) {
        case 1:
          return selectedConnector &&
            selectedNode &&
            connectorFields &&
            (!isGoogleSheetsConnector || previewConfigurationKey === currentConfigurationKey) ? (
            <FieldsSelectionStep
              connector={selectedConnector}
              connectorFields={connectorFields}
              selectedField={selectedNode}
              selectedFields={selectedFields}
              configuration={connectorConfiguration}
              onFieldToggle={handleFieldToggle}
              onSelectAllFields={handleSelectAllFields}
              itemLabel={
                selectedConnector.name === GOOGLE_SHEETS_CONNECTOR_NAME ? 'columns' : 'fields'
              }
              searchPlaceholder={
                selectedConnector.name === GOOGLE_SHEETS_CONNECTOR_NAME
                  ? 'Search column'
                  : 'Search field'
              }
              autoSelectDefaultFields={
                selectedConnector.name === GOOGLE_SHEETS_CONNECTOR_NAME
                  ? autoSelectPreviewDefaults
                  : undefined
              }
            />
          ) : isGoogleSheetsConnector && loadingFields ? (
            <AppWizardStepLoading variant='list' />
          ) : isGoogleSheetsConnector && fieldsOnlyPreviewError ? (
            <div
              role='alert'
              className='flex min-h-48 flex-col items-center justify-center gap-3 text-center'
            >
              <p className='text-destructive text-sm'>{fieldsOnlyPreviewError}</p>
              <Button
                type='button'
                size='sm'
                variant='outline'
                aria-label='Retry loading Google Sheets columns'
                onClick={() => {
                  fieldsOnlyPreviewStartedForOpenRef.current = true;
                  void loadGoogleSheetsPreviewFields({
                    connectorName: existingConnector?.source.name,
                    configuration: existingConnector?.source.configuration[0] ?? {},
                    selectedFields: existingConnector?.source.fields,
                  });
                }}
              >
                <RefreshCw className='h-4 w-4' />
                Retry
              </Button>
            </div>
          ) : null;
        default:
          return null;
      }
    }

    switch (currentStep) {
      case 1:
        return (
          <ConnectorSelectionStep
            connectors={connectors}
            selectedConnector={selectedConnector}
            loading={loading}
            error={error}
            onConnectorSelect={handleConnectorSelect}
            onConnectorDoubleClick={() => {
              setCurrentStep(prev => (prev < totalSteps ? prev + 1 : prev));
            }}
          />
        );
      case 2:
        return selectedConnector && connectorSpecification ? (
          <ConfigurationStep
            connector={selectedConnector}
            connectorSpecification={connectorSpecification}
            onConfigurationChange={handleConfigurationChange}
            onValidationChange={handleConfigurationValidationChange}
            initialConfiguration={connectorConfiguration}
            loading={loadingSpecification}
            isEditingExisting={false}
            disabled={isGoogleSheetsConnector && loadingFields}
          />
        ) : null;
      case 3:
        if (isGoogleSheetsConnector) {
          return selectedNode && connectorFields ? (
            <FieldsSelectionStep
              connector={selectedConnector}
              connectorFields={connectorFields}
              selectedField={selectedNode}
              selectedFields={selectedFields}
              onFieldToggle={handleFieldToggle}
              onSelectAllFields={handleSelectAllFields}
              itemLabel='columns'
              searchPlaceholder='Search column'
              autoSelectDefaultFields={autoSelectPreviewDefaults}
            />
          ) : null;
        }

        return selectedConnector && connectorFields ? (
          <NodesSelectionStep
            connectorFields={connectorFields}
            connector={selectedConnector}
            selectedField={selectedNode}
            connectorName={selectedConnector.displayName}
            loading={loadingFields}
            onFieldSelect={handleFieldSelect}
          />
        ) : null;
      case 4:
        if (isGoogleSheetsConnector) {
          return selectedNode && connectorFields ? (
            <TargetSetupStep
              dataStorageType={dataStorageType}
              destinationName={getDestinationName(connectorFields, selectedNode)}
              connectorName={selectedConnector.displayName}
              target={target}
              onTargetChange={handleTargetChange}
            />
          ) : null;
        }

        return selectedConnector && selectedNode && connectorFields ? (
          <FieldsSelectionStep
            connector={selectedConnector}
            connectorFields={connectorFields}
            selectedField={selectedNode}
            selectedFields={selectedFields}
            configuration={connectorConfiguration}
            onFieldToggle={handleFieldToggle}
            onSelectAllFields={handleSelectAllFields}
          />
        ) : null;
      case 5:
        return selectedNode && connectorFields ? (
          <TargetSetupStep
            dataStorageType={dataStorageType}
            destinationName={getDestinationName(connectorFields, selectedNode)}
            connectorName={selectedConnector?.displayName ?? ''}
            target={target}
            onTargetChange={handleTargetChange}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <AppWizard>
      <AppWizardLayout>{renderCurrentStep()}</AppWizardLayout>

      <AppWizardActions variant='horizontal'>
        <StepNavigation
          currentStep={currentStep}
          totalSteps={totalSteps}
          canGoNext={canGoNext()}
          canGoBack={canGoBack()}
          isLoading={loadingSpecification || loadingFields}
          onNext={() => {
            void handleNext();
          }}
          onBack={handleBack}
          onFinish={() => {
            const availableFields =
              connectorFields
                ?.find(field => field.name === selectedNode)
                ?.fields?.map(field => field.name) ?? [];
            const activeSelectedFields =
              selectedConnector?.name === GOOGLE_SHEETS_CONNECTOR_NAME
                ? getAvailableGoogleSheetsSelectedFields(selectedFields, availableFields)
                : selectedFields;

            if (configurationOnly && selectedConnector) {
              onSubmit({
                source: {
                  name: selectedConnector.name,
                  configuration: [connectorConfiguration],
                  node: existingConnector?.source.node ?? selectedNode,
                  fields: fieldsForSave,
                },
                storage: existingConnector?.storage ?? {
                  fullyQualifiedName: existingConnector?.storage.fullyQualifiedName ?? '',
                },
              });
              trackEvent({
                event: 'connector_setup',
                category: selectedConnector.name,
                action: 'created',
                label: 'configuration-only',
              });
            } else if (mode === 'fields-only' && existingConnector) {
              onSubmit({
                source: {
                  ...existingConnector.source,
                  configuration:
                    existingConnector.source.name === GOOGLE_SHEETS_CONNECTOR_NAME
                      ? [
                          withGoogleSheetsImportAllColumns(
                            existingConnector.source.configuration[0] ?? {},
                            selectedFields,
                            availableFields,
                            existingConnector.source.fields
                          ),
                        ]
                      : existingConnector.source.configuration,
                  fields: activeSelectedFields,
                },
                storage: existingConnector.storage,
              });
              trackEvent({
                event: 'connector_setup',
                category: existingConnector.source.name,
                action: 'created',
                label: 'fields-only',
              });
            } else if (selectedConnector && target) {
              onSubmit({
                source: {
                  name: selectedConnector.name,
                  configuration: [
                    selectedConnector.name === GOOGLE_SHEETS_CONNECTOR_NAME
                      ? withGoogleSheetsImportAllColumns(
                          connectorConfiguration,
                          selectedFields,
                          availableFields,
                          existingConnector?.source.fields
                        )
                      : connectorConfiguration,
                  ],
                  node: selectedNode,
                  fields: activeSelectedFields,
                },
                storage: {
                  fullyQualifiedName: target.fullyQualifiedName,
                },
              });
              trackEvent({
                event: 'connector_setup',
                category: selectedConnector.name,
                action: 'created',
                label: 'full',
              });
            }
            setIsDirty(false);
          }}
        />
      </AppWizardActions>
    </AppWizard>
  );
}
