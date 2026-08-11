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
  getGoogleSheetsPreviewConfigurationKey,
  isGoogleSheetsSystemField,
  resolveGoogleSheetsPreviewSelection,
  withoutGoogleSheetsSystemFields,
  withGoogleSheetsImportAllColumns,
} from '../../../shared/utils/google-sheets-fields.utils';
import { ConnectorBuilderApiService } from '../../../../connector-builder/shared/api/connector-builder-api.service';
import type { CustomConnectorListItemDto } from '../../../../connector-builder/shared/api/types';
import { useProjectRoute } from '../../../../../shared/hooks/useProjectRoute';

const connectorKey = (c: ConnectorListItem) =>
  c.isCustom && c.id ? `custom:${c.id}` : `bundled:${c.name}`;

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
  const { navigate } = useProjectRoute();
  const [customConnectors, setCustomConnectors] = useState<CustomConnectorListItemDto[]>([]);
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
  // The pin submitted for a custom connector's source `version`. `undefined` means
  // "follow active" (the default for a fresh setup); a number pins that exact
  // published version. Kept separate from `selectedConnector.version`, which stays
  // the connector's active-version snapshot — needed by ConnectorVersionControl's
  // own staleness math — and must not be overwritten by the user's pin choice.
  const [pinnedVersion, setPinnedVersion] = useState<number | undefined>(undefined);
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

  useEffect(() => {
    const api = new ConnectorBuilderApiService();
    api
      .list()
      .then(setCustomConnectors)
      .catch(() => {
        setCustomConnectors([]);
      });
  }, []);

  const [target, setTarget] = useState<{ fullyQualifiedName: string; isValid: boolean } | null>(
    null
  );
  const isGoogleSheetsConnector = selectedConnector?.name === GOOGLE_SHEETS_CONNECTOR_NAME;
  const currentConfigurationKey = useMemo(
    () => getGoogleSheetsPreviewConfigurationKey(connectorConfiguration),
    [connectorConfiguration]
  );

  const steps = useMemo(() => {
    if (configurationOnly) {
      if (isGoogleSheetsConnector) {
        return [
          { id: 1, title: 'Configuration', description: 'Set up connector parameters' },
          { id: 2, title: 'Select Columns', description: 'Pick sheet columns' },
        ];
      }
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

  const customAsListItems = useMemo<ConnectorListItem[]>(
    () =>
      customConnectors.map(c => ({
        name: c.name,
        displayName: c.title || c.name,
        description: c.description ?? '',
        logoBase64: c.logo,
        docUrl: c.docUrl,
        isCustom: true,
        id: c.id,
        version: c.activeVersion ?? undefined,
      })),
    [customConnectors]
  );

  const allConnectors = useMemo(
    () => [...connectors, ...customAsListItems],
    [connectors, customAsListItems]
  );

  const loadSpecificationSafely = useCallback(
    async (connector: ConnectorListItem) => {
      const key = connectorKey(connector);
      if (!loadedSpecifications.has(key) && !loadingSpecification) {
        setLoadedSpecifications(prev => new Set(prev).add(key));
        await fetchConnectorSpecification(connector);
      }
    },
    [loadedSpecifications, loadingSpecification, fetchConnectorSpecification]
  );

  const loadFieldsSafely = useCallback(
    async (connector: ConnectorListItem) => {
      const key = connectorKey(connector);
      if (!loadedFields.has(key)) {
        setLoadedFields(prev => new Set(prev).add(key));
        await fetchConnectorFields(connector);
      }
    },
    [loadedFields, fetchConnectorFields]
  );

  useEffect(() => {
    if (!preselectedConnector) return;
    if (selectedConnector) return;
    if (allConnectors.length === 0) return;

    const found = allConnectors.find(c => c.name === preselectedConnector);
    if (found) {
      setSelectedConnector(found);
      setCurrentStep(initialStep ?? 2);
      // if in full flow ensure fields/spec are loaded:
      void loadSpecificationSafely(found);
      if (
        !configurationOnly &&
        mode !== 'fields-only' &&
        found.name !== GOOGLE_SHEETS_CONNECTOR_NAME
      ) {
        void loadFieldsSafely(found);
      }
    }
  }, [
    preselectedConnector,
    allConnectors,
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

      const matchedConnectorDef =
        source.version !== undefined
          ? allConnectors.find(c => c.name === source.name && c.isCustom)
          : allConnectors.find(c => c.name === source.name);
      if (matchedConnectorDef) {
        // For pinned custom connectors, carry the saved version so the spec/fields
        // for that exact published version are loaded.
        const existingConnectorDef =
          matchedConnectorDef.isCustom && source.version !== undefined
            ? { ...matchedConnectorDef, version: source.version }
            : matchedConnectorDef;
        setSelectedConnector(existingConnectorDef);
        setPinnedVersion(source.version);

        void loadSpecificationSafely(existingConnectorDef);
        if (existingConnectorDef.name !== GOOGLE_SHEETS_CONNECTOR_NAME) {
          // Fields power both the Fields step and the data-level reconciliation at save.
          void loadFieldsSafely(existingConnectorDef);
        }
      }
    }

    // Configuration-only mode setup. Skipped when a preselectedConnector is
    // active — that case is owned entirely by the preselect effect above.
    // Without this guard, both effects read `selectedConnector === null` in
    // the same commit once the connector list populates, and this one (being
    // declared second) wins — overwriting the deep-linked connector with
    // `connectors[0]` (the alphabetically-first bundled connector).
    if (
      configurationOnly &&
      connectors.length > 0 &&
      !selectedConnector &&
      !existingConnector &&
      !preselectedConnector
    ) {
      const firstConnector = connectors[0];
      setSelectedConnector(firstConnector);
      void loadSpecificationSafely(firstConnector);
    }
  }, [
    mode,
    existingConnector,
    connectors,
    allConnectors,
    configurationOnly,
    loading,
    fetchAvailableConnectors,
    loadSpecificationSafely,
    loadFieldsSafely,
    selectedConnector,
    preselectedConnector,
  ]);

  const effectiveDataLevel = useMemo(
    () => resolveEffectiveDataLevel(connectorConfiguration, connectorSpecification),
    [connectorConfiguration, connectorSpecification]
  );
  const availableSelectedNodeFields = useMemo(
    () =>
      connectorFields
        ?.find(field => field.name === selectedNode)
        ?.fields?.map(field => field.name) ?? [],
    [connectorFields, selectedNode]
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
    setPinnedVersion(undefined);
    setIsDirty(true);
    const key = connectorKey(connector);
    setLoadedSpecifications(prev => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
    setLoadedFields(prev => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
    void loadSpecificationSafely(connector);
    if (connector.name !== GOOGLE_SHEETS_CONNECTOR_NAME) {
      void loadFieldsSafely(connector);
    }
  };

  const handleChangeVersion = (version?: number) => {
    if (!selectedConnector) return;
    setPinnedVersion(version);
    // connectorKey only varies by id/name, not version — the key is already
    // marked "loaded" from the initial fetch, so the loadSpecificationSafely/
    // loadFieldsSafely guards (which key off that same loaded-set) would skip
    // a refetch here even after we delete the key, since their closures were
    // captured before this render's setState calls apply. Fetch directly
    // instead — this handler is an explicit user-triggered refetch, not the
    // load-once-per-mount case those helpers guard against. fetchConnectorSpecification/
    // fetchConnectorFields have no duplicate-call guard of their own, so this is
    // safe only because onChangeVersion is fired solely from an explicit user
    // click here — a second call site would need its own dedup.
    const pinnedConnector = { ...selectedConnector, version };
    const key = connectorKey(pinnedConnector);
    setLoadedSpecifications(prev => new Set(prev).add(key));
    setLoadedFields(prev => new Set(prev).add(key));
    void fetchConnectorSpecification(pinnedConnector);
    void fetchConnectorFields(pinnedConnector);
  };

  const handleFieldSelect = (fieldName: string) => {
    setSelectedNode(fieldName);
    setSelectedFields([]);
    setIsDirty(true);
  };

  const handleFieldToggle = (fieldName: string, isChecked: boolean) => {
    const nextSelectedFields = isChecked
      ? selectedFields.includes(fieldName)
        ? selectedFields
        : [...selectedFields, fieldName]
      : selectedFields.filter(field => field !== fieldName);

    setSelectedFields(nextSelectedFields);
    if (isGoogleSheetsConnector) {
      setConnectorConfiguration(configuration =>
        withGoogleSheetsImportAllColumns(
          configuration,
          nextSelectedFields,
          availableSelectedNodeFields,
          selectedFields
        )
      );
    }
    setIsDirty(true);
  };

  const handleSelectAllFields = (fieldNames: string[], isSelected: boolean) => {
    const nextSelectedFields = isSelected
      ? [...selectedFields, ...fieldNames.filter(fieldName => !selectedFields.includes(fieldName))]
      : selectedFields.filter(fieldName => !fieldNames.includes(fieldName));

    setSelectedFields(nextSelectedFields);
    if (isGoogleSheetsConnector) {
      setConnectorConfiguration(configuration =>
        withGoogleSheetsImportAllColumns(
          configuration,
          nextSelectedFields,
          availableSelectedNodeFields,
          selectedFields
        )
      );
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
      const configurationKey = getGoogleSheetsPreviewConfigurationKey(configuration);
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

        const selectedFieldsToPreserve = options?.selectedFields ?? selectedFields;
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
        const status = (error as { response?: { status?: number } }).response?.status;
        const handledByGlobalInterceptor = status === 400 || status === 403 || status === 404;
        if (mode !== 'fields-only' && !handledByGlobalInterceptor) {
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
    const shouldPreviewGoogleSheetsFields =
      isGoogleSheetsConnector &&
      ((!configurationOnly && currentStep === 2) || (configurationOnly && currentStep === 1));
    if (shouldPreviewGoogleSheetsFields) {
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
      if (currentStep === 1) {
        return selectedConnector !== null && configurationIsValid;
      }
      return (
        isGoogleSheetsConnector &&
        previewConfigurationKey === currentConfigurationKey &&
        selectedNode !== '' &&
        selectedFields.some(fieldName => !isGoogleSheetsSystemField(fieldName))
      );
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

    if (configurationOnly && currentStep === 2 && isGoogleSheetsConnector) {
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
            customConnectors={customAsListItems}
            onCreateNew={() => {
              navigate('/connectors/builder/new');
            }}
            onEditConnector={connector => {
              if (connector.id) navigate(`/connectors/builder/${connector.id}`);
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
            pinnedVersion={pinnedVersion}
            onChangeVersion={handleChangeVersion}
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
            const availableFields = availableSelectedNodeFields;
            const activeSelectedFields =
              selectedConnector?.name === GOOGLE_SHEETS_CONNECTOR_NAME
                ? getAvailableGoogleSheetsSelectedFields(selectedFields, availableFields)
                : selectedFields;

            if (configurationOnly && selectedConnector) {
              const configuration = isGoogleSheetsConnector
                ? withGoogleSheetsImportAllColumns(
                    connectorConfiguration,
                    selectedFields,
                    availableFields,
                    existingConnector?.source.fields
                  )
                : connectorConfiguration;
              onSubmit({
                source: {
                  name: selectedConnector.name,
                  configuration: [configuration],
                  node: existingConnector?.source.node ?? selectedNode,
                  fields: isGoogleSheetsConnector ? activeSelectedFields : fieldsForSave,
                  ...(selectedConnector.isCustom && pinnedVersion !== undefined
                    ? { version: pinnedVersion }
                    : {}),
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
                  ...(selectedConnector.isCustom && pinnedVersion !== undefined
                    ? { version: pinnedVersion }
                    : {}),
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
