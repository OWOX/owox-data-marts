import { useConnector } from '../../../../data-storage/shared/model/hooks/useConnector';
import type { ConnectorDefinitionDto } from '../../../../data-storage/shared/api/types/response';
import { useEffect, useState, useCallback } from 'react';

import { DataStorageType } from '../../../../data-storage/shared/model/types';
import {
  ConnectorSelectionStep,
  ConfigurationStep,
  NodesSelectionStep,
  FieldsSelectionStep,
  TargetSetupStep,
} from './steps';
import { StepNavigation } from './components';
import type { ConnectorConfig } from '../../../../data-marts/edit/model';

interface ConnectorEditFormProps {
  onSubmit: (connector: ConnectorConfig) => void;
  dataStorageType: DataStorageType;
  configurationOnly?: boolean;
  existingConnector?: ConnectorConfig | null;
}

export function ConnectorEditForm({
  onSubmit,
  dataStorageType,
  configurationOnly = false,
  existingConnector = null,
}: ConnectorEditFormProps) {
  const [selectedConnector, setSelectedConnector] = useState<ConnectorDefinitionDto | null>(null);
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [connectorConfiguration, setConnectorConfiguration] = useState<Record<string, unknown>>({});
  const [loadedSpecifications, setLoadedSpecifications] = useState<Set<string>>(new Set());
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
  const [target, setTarget] = useState<{ fullyQualifiedName: string } | null>(null);

  const steps = configurationOnly
    ? [{ id: 1, title: 'Configuration', description: 'Set up connector parameters' }]
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

  useEffect(() => {
    if (connectors.length === 0 && !loading) {
      void fetchAvailableConnectors();
    }
  }, [connectors.length, loading, fetchAvailableConnectors]);

  useEffect(() => {
    if (existingConnector) {
      const { source, storage } = existingConnector;

      setSelectedNode(source.node);
      setSelectedFields(source.fields);
      setConnectorConfiguration(source.configuration[0] || {});

      setTarget({
        fullyQualifiedName: storage.fullyQualifiedName,
      });

      if (connectors.length > 0) {
        const existingConnectorDef = connectors.find(c => c.name === source.name);
        if (existingConnectorDef) {
          setSelectedConnector(existingConnectorDef);

          if (configurationOnly) {
            void loadSpecificationSafely(existingConnectorDef.name);
          } else {
            void loadSpecificationSafely(existingConnectorDef.name);
            void fetchConnectorFields(existingConnectorDef.name);
          }
        }
      }
    }
  }, [
    existingConnector,
    connectors,
    configurationOnly,
    loadSpecificationSafely,
    fetchConnectorFields,
  ]);

  useEffect(() => {
    if (configurationOnly && connectors.length > 0 && !selectedConnector && !existingConnector) {
      const firstConnector = connectors[0];
      setSelectedConnector(firstConnector);
      void loadSpecificationSafely(firstConnector.name);
    }
  }, [
    configurationOnly,
    connectors,
    selectedConnector,
    existingConnector,
    loadSpecificationSafely,
  ]);

  const handleConnectorSelect = (connector: ConnectorDefinitionDto) => {
    setSelectedConnector(connector);
    setConnectorConfiguration({});
    setLoadedSpecifications(prev => {
      const newSet = new Set(prev);
      newSet.delete(connector.name);
      return newSet;
    });
    void loadSpecificationSafely(connector.name);
    void fetchConnectorFields(connector.name);
  };

  const handleFieldSelect = (fieldName: string) => {
    setSelectedNode(fieldName);
    setSelectedFields([]);
  };

  const handleFieldToggle = (fieldName: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedFields(prev => [...prev, fieldName]);
    } else {
      setSelectedFields(prev => prev.filter(f => f !== fieldName));
    }
  };

  const handleTargetChange = (newTarget: { fullyQualifiedName: string }) => {
    setTarget(newTarget);
  };

  const handleConfigurationChange = useCallback((configuration: Record<string, unknown>) => {
    setConnectorConfiguration(configuration);
  }, []);

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
      return selectedConnector !== null && currentStep === 1;
    }

    switch (currentStep) {
      case 1:
        return selectedConnector !== null;
      case 2:
        return true;
      case 3:
        return selectedNode !== '';
      case 4:
        return selectedFields.length > 0;
      case 5:
        return target !== null;
      default:
        return false;
    }
  };

  const canGoBack = () => {
    return currentStep > 1;
  };

  const renderCurrentStep = () => {
    if (configurationOnly && currentStep === 1) {
      return connectorSpecification ? (
        <ConfigurationStep
          connectorSpecification={connectorSpecification}
          onConfigurationChange={handleConfigurationChange}
          initialConfiguration={connectorConfiguration}
          loading={loadingSpecification}
        />
      ) : null;
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
          />
        );
      case 2:
        return selectedConnector && connectorSpecification ? (
          <ConfigurationStep
            connectorSpecification={connectorSpecification}
            onConfigurationChange={handleConfigurationChange}
            initialConfiguration={connectorConfiguration}
            loading={loadingSpecification}
          />
        ) : null;
      case 3:
        return selectedConnector && connectorFields ? (
          <NodesSelectionStep
            connectorFields={connectorFields}
            selectedField={selectedNode}
            loading={loadingFields}
            onFieldSelect={handleFieldSelect}
          />
        ) : null;
      case 4:
        return selectedNode && connectorFields ? (
          <FieldsSelectionStep
            connectorFields={connectorFields}
            selectedField={selectedNode}
            selectedFields={selectedFields}
            onFieldToggle={handleFieldToggle}
          />
        ) : null;
      case 5:
        return (
          <TargetSetupStep
            dataStorageType={dataStorageType}
            selectedNode={selectedNode}
            target={target}
            onTargetChange={handleTargetChange}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className='flex h-full flex-col p-4'>
      <div className='mb-6 flex-1 overflow-y-auto'>{renderCurrentStep()}</div>
      <div className='-mx-4 border-t bg-white px-4 pt-4'>
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
      </div>
    </div>
  );
}
