import { useConnector } from '../../../shared/model/hooks/useConnector';
import type { ConnectorListItem } from '../../../shared/model/types/connector';
import { useEffect, useState, useCallback } from 'react';

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
import { AppWizard, AppWizardLayout, AppWizardActions } from '@owox/ui/components/common/wizard';

interface ConnectorEditFormProps {
  onSubmit: (connector: ConnectorConfig) => void;
  dataStorageType: DataStorageType;
  configurationOnly?: boolean;
  existingConnector?: ConnectorConfig | null;
  mode?: 'full' | 'configuration-only' | 'fields-only';
  initialStep?: number;
  preselectedConnector?: string | null;
}

export function ConnectorEditForm({
  onSubmit,
  dataStorageType,
  configurationOnly = false,
  existingConnector = null,
  mode = 'full',
  initialStep,
  preselectedConnector,
}: ConnectorEditFormProps) {
  const [selectedConnector, setSelectedConnector] = useState<ConnectorListItem | null>(null);
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [connectorConfiguration, setConnectorConfiguration] = useState<Record<string, unknown>>({});
  const [configurationIsValid, setConfigurationIsValid] = useState<boolean>(false);
  const [loadedSpecifications, setLoadedSpecifications] = useState<Set<string>>(new Set());
  const [loadedFields, setLoadedFields] = useState<Set<string>>(new Set());
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
  } = useConnector();

  const [target, setTarget] = useState<{ fullyQualifiedName: string; isValid: boolean } | null>(
    null
  );

  const steps = configurationOnly
    ? [{ id: 1, title: 'Configuration', description: 'Set up connector parameters' }]
    : mode === 'fields-only'
      ? [{ id: 1, title: 'Select Fields', description: 'Pick specific fields' }]
      : [
          { id: 1, title: 'Select Connector', description: 'Choose a data source' },
          { id: 2, title: 'Configuration', description: 'Set up connector parameters' },
          { id: 3, title: 'Select Nodes', description: 'Choose data nodes' },
          { id: 4, title: 'Select Fields', description: 'Pick specific fields' },
          { id: 5, title: 'Target Setup', description: 'Configure destination' },
        ];

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
      if (!configurationOnly && mode !== 'fields-only') {
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
        if (!configurationOnly && mode !== 'fields-only') {
          void loadFieldsSafely(existingConnectorDef.name);
        }
        if (mode === 'fields-only') {
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

  const handleConnectorSelect = (connector: ConnectorListItem) => {
    setSelectedConnector(connector);
    setConnectorConfiguration({});
    setConfigurationIsValid(false);
    setLoadedSpecifications(prev => {
      const newSet = new Set(prev);
      newSet.delete(connector.name);
      return newSet;
    });
    void loadSpecificationSafely(connector.name);
    void loadFieldsSafely(connector.name);
  };

  const handleFieldSelect = (fieldName: string) => {
    setSelectedNode(fieldName);
    setSelectedFields([]);
  };

  const handleFieldToggle = (fieldName: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedFields(prev => (prev.includes(fieldName) ? prev : [...prev, fieldName]));
    } else {
      setSelectedFields(prev => prev.filter(f => f !== fieldName));
    }
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
  };

  const handleTargetChange = (
    newTarget: { fullyQualifiedName: string; isValid: boolean } | null
  ) => {
    setTarget(newTarget);
  };

  const handleConfigurationChange = useCallback((configuration: Record<string, unknown>) => {
    setConnectorConfiguration(configuration);
  }, []);

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

  const handleNext = () => {
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
        return selectedNode !== '';
      case 4:
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
        />
      ) : null;
    }

    if (mode === 'fields-only') {
      switch (currentStep) {
        case 1:
          return selectedConnector && selectedNode && connectorFields ? (
            <FieldsSelectionStep
              connector={selectedConnector}
              connectorFields={connectorFields}
              selectedField={selectedNode}
              selectedFields={selectedFields}
              onFieldToggle={handleFieldToggle}
              onSelectAllFields={handleSelectAllFields}
            />
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
          />
        ) : null;
      case 3:
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
        return selectedConnector && selectedNode && connectorFields ? (
          <FieldsSelectionStep
            connector={selectedConnector}
            connectorFields={connectorFields}
            selectedField={selectedNode}
            selectedFields={selectedFields}
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
          onNext={handleNext}
          onBack={handleBack}
          onFinish={() => {
            if (configurationOnly && selectedConnector) {
              onSubmit({
                source: {
                  name: selectedConnector.name,
                  configuration: [connectorConfiguration],
                  node: existingConnector?.source.node ?? selectedNode,
                  fields: existingConnector?.source.fields ?? selectedFields,
                },
                storage: existingConnector?.storage ?? {
                  fullyQualifiedName: existingConnector?.storage.fullyQualifiedName ?? '',
                },
              });
            } else if (mode === 'fields-only' && existingConnector) {
              onSubmit({
                source: {
                  ...existingConnector.source,
                  fields: selectedFields,
                },
                storage: existingConnector.storage,
              });
            } else if (selectedConnector && target) {
              onSubmit({
                source: {
                  name: selectedConnector.name,
                  configuration: [connectorConfiguration],
                  node: selectedNode,
                  fields: selectedFields,
                },
                storage: {
                  fullyQualifiedName: target.fullyQualifiedName,
                },
              });
            }
          }}
        />
      </AppWizardActions>
    </AppWizard>
  );
}
