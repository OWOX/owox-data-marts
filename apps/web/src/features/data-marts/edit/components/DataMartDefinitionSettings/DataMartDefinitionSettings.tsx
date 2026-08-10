import { useState, useEffect, useCallback, useRef } from 'react';
import { useForm, FormProvider, type SubmitHandler, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DataMartDefinitionTypeSelector } from './form/DataMartDefinitionTypeSelector.tsx';
import { DataMartDefinitionForm } from './form/DataMartDefinitionForm.tsx';
import { DataMartDefinitionType } from '../../../shared';
import { DataStorageType } from '../../../../data-storage';
import { useDataMartPreset } from '../../../shared/utils/useDataMartPreset.ts';
import {
  createDataMartDefinitionSchema,
  type DataMartDefinitionFormData,
} from '../../model/schema/data-mart-definition.schema.ts';
import { Button } from '@owox/ui/components/button';
import { useOutletContext } from 'react-router';
import type { DataMartContextType } from '../../model/context/types.ts';
import { getEmptyDefinition } from '../../utils/definition-helpers.ts';
import SqlValidator from '../SqlValidator/SqlValidator.tsx';
import type { DataMartDefinitionConfig, SqlDefinitionConfig } from '../../model';
import { ChangeInputSourceTypeDialog } from './ChangeInputSourceTypeDialog.tsx';
import { useInputSourceChangeImpact } from './useInputSourceChangeImpact.ts';

interface DataMartDefinitionSettingsProps {
  definitionType: DataMartDefinitionType | null;
  initialDefinitionType: DataMartDefinitionType | null;
  setDefinitionType: (type: DataMartDefinitionType) => void;
  sqlRevalidateVersion?: number;
}

interface SqlValidationState {
  isValid: boolean | null;
  isLoading: boolean;
  error: string | null;
}

const initialSqlValidationState: SqlValidationState = {
  isValid: null,
  isLoading: false,
  error: null,
};

const getSqlQueryFromDefinition = (
  definitionType: DataMartDefinitionType | null,
  currentDefinition: unknown
): string => {
  if (definitionType !== DataMartDefinitionType.SQL) {
    return '';
  }

  const sqlDefinition = currentDefinition as SqlDefinitionConfig | undefined;
  return sqlDefinition?.sqlQuery ?? '';
};

const getEmptyDefinitionForUpdate = (type: DataMartDefinitionType): DataMartDefinitionConfig =>
  getEmptyDefinition(type) as DataMartDefinitionConfig;

const EMPTY_EXCLUDED_TYPES: DataMartDefinitionType[] = [];

export function DataMartDefinitionSettings({
  definitionType,
  initialDefinitionType,
  setDefinitionType,
  sqlRevalidateVersion,
}: DataMartDefinitionSettingsProps) {
  const { dataMart, updateDataMartDefinition, runSchemaActualization, runGuarded } =
    useOutletContext<DataMartContextType>();
  const preset = useDataMartPreset();

  if (!dataMart) {
    throw new Error('Data mart not found');
  }
  const {
    definition: initialDefinition,
    id: dataMartId,
    storage: { id: storageId, type: storageType, config: storageConfig },
  } = dataMart;

  const [, setSqlValidationState] = useState<SqlValidationState>(initialSqlValidationState);
  const [shouldActualizeSchema, setShouldActualizeSchema] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<DataMartDefinitionFormData | null>(
    null
  );

  // A staged type change: the user picked another type but has not saved it yet. Until they do,
  // the Data Mart still runs on `initialDefinitionType`.
  const isTypeChangeStaged = Boolean(
    initialDefinitionType && definitionType && definitionType !== initialDefinitionType
  );

  // The selector is shown while setting a Data Mart up, and afterwards so the source can be
  // repointed. Two exclusions: a connector owns a write target, stored secrets and its own run
  // triggers, so its type stays fixed; and legacy BigQuery storages only ever accept SQL, so
  // there is nothing to switch between.
  const canChangeDefinitionType =
    storageType !== DataStorageType.LEGACY_GOOGLE_BIGQUERY &&
    (!initialDefinitionType || initialDefinitionType !== DataMartDefinitionType.CONNECTOR);

  const {
    impact,
    isLoading: isLoadingImpact,
    hasError: impactFailed,
    retry: retryImpact,
  } = useInputSourceChangeImpact(dataMartId, pendingTypeChange !== null);

  const getInitialFormValues = useCallback((): DataMartDefinitionFormData | undefined => {
    if (!definitionType) return undefined;

    const emptyValues = {
      definitionType,
      definition: getEmptyDefinition(definitionType),
    };

    // The saved definition only fits the saved type. Once another type is staged the user has to
    // pick a new source, so we start that form empty rather than carrying over a shape it cannot
    // interpret.
    if (!initialDefinition || (initialDefinitionType && definitionType !== initialDefinitionType)) {
      return emptyValues as DataMartDefinitionFormData;
    }

    return {
      definitionType,
      definition: initialDefinition,
    } as DataMartDefinitionFormData;
  }, [definitionType, initialDefinition, initialDefinitionType]);

  const currentResolver = useCallback((): Resolver<DataMartDefinitionFormData> | undefined => {
    if (!definitionType) return undefined;
    const schema = createDataMartDefinitionSchema(definitionType, storageType);
    return zodResolver(schema) as unknown as Resolver<DataMartDefinitionFormData>;
  }, [definitionType, storageType]);

  const methods = useForm<DataMartDefinitionFormData>({
    resolver: currentResolver(),
    defaultValues: getInitialFormValues(),
    mode: 'onChange',
  });

  const {
    handleSubmit,
    reset,
    watch,
    formState: { isDirty, isValid },
  } = methods;

  const currentDefinition = watch('definition');
  const sqlCode = getSqlQueryFromDefinition(definitionType, currentDefinition);

  const lastResetTypeRef = useRef<DataMartDefinitionType | null>(null);

  useEffect(() => {
    if (!definitionType) return;

    // Picking another type has to re-shape the form, so that reset always runs. Every other reason
    // this effect re-runs is a Data Mart refresh handing us a new `definition` object — schema
    // actualization after a save, a relationship change, a publish. Those must not overwrite what
    // the user is typing: `getInitialFormValues` returns the *saved* definition (or an empty one
    // while a type change is staged), so resetting mid-edit throws the unsaved query away.
    const isTypeSwitch = definitionType !== lastResetTypeRef.current;
    lastResetTypeRef.current = definitionType;
    if (!isTypeSwitch && isDirty) return;

    reset(getInitialFormValues());
  }, [definitionType, reset, getInitialFormValues, isDirty]);

  useEffect(() => {
    if (!definitionType && !initialDefinitionType && preset?.definitionType) {
      setDefinitionType(preset.definitionType);
      const initialValues = {
        definitionType: preset.definitionType,
        definition: getEmptyDefinitionForUpdate(preset.definitionType),
      } as DataMartDefinitionFormData;

      reset(initialValues);
    }
  }, [preset, definitionType, initialDefinitionType, reset, setDefinitionType]);

  // Handle validation state changes from SqlValidator
  const handleValidationStateChange = useCallback(
    (state: {
      isLoading: boolean;
      isValid: boolean | null;
      error: string | null;
      bytes: number | null;
    }) => {
      setSqlValidationState({
        isLoading: state.isLoading,
        isValid: state.isValid,
        error: state.error,
      });
    },
    []
  );

  const handleTypeSelect = useCallback(
    (type: DataMartDefinitionType) => {
      setDefinitionType(type);
    },
    [setDefinitionType]
  );

  const onSubmit: SubmitHandler<DataMartDefinitionFormData> = useCallback(
    async (data: DataMartDefinitionFormData) => {
      if (definitionType && dataMartId) {
        try {
          await updateDataMartDefinition(dataMartId, data.definitionType, data.definition);
          setShouldActualizeSchema(true);
          // Re-baseline dirtiness on the snapshot that was actually saved, but keep the live
          // values: anything typed while the request was in flight stays in the editor and
          // simply leaves the form dirty again instead of being snapped back to the snapshot.
          reset(data, { keepValues: true });
        } catch (error) {
          console.error('Failed to update data mart definition:', error);
        }
      }
    },
    [dataMartId, definitionType, updateDataMartDefinition, reset]
  );

  useEffect(() => {
    if (shouldActualizeSchema) {
      setShouldActualizeSchema(false);
      void runSchemaActualization?.();
    }
  }, [shouldActualizeSchema, runSchemaActualization]);

  const runSubmitGuarded = useCallback(
    (data: DataMartDefinitionFormData) => {
      const runSubmit = () => {
        void onSubmit(data);
      };
      if (runGuarded) {
        runGuarded(runSubmit, { intent: 'definition' });
      } else {
        runSubmit();
      }
    },
    [onSubmit, runGuarded]
  );

  const guardedSubmit = useCallback<SubmitHandler<DataMartDefinitionFormData>>(
    data => {
      // Repointing a Data Mart at another type of source can disconnect fields that reports and
      // relationships rely on, so it is confirmed explicitly. A same-type edit saves directly.
      if (isTypeChangeStaged) {
        setPendingTypeChange(data);
        return;
      }
      runSubmitGuarded(data);
    },
    [isTypeChangeStaged, runSubmitGuarded]
  );

  const handleConfirmTypeChange = useCallback(() => {
    if (!pendingTypeChange) return;
    const data = pendingTypeChange;
    setPendingTypeChange(null);
    runSubmitGuarded(data);
  }, [pendingTypeChange, runSubmitGuarded]);

  const handleFormSubmit = useCallback(
    (e?: React.SyntheticEvent<HTMLFormElement>) => {
      e?.preventDefault();
      // Validate the definition form BEFORE involving the schema guard. Only a
      // valid submission opens the guard dialog, so we never save/discard schema
      // edits for a definition change that fails validation and never fires.
      void handleSubmit(guardedSubmit)();
    },
    [handleSubmit, guardedSubmit]
  );

  const handleReset = useCallback(() => {
    // Discarding a staged type change must also put the selector back on the saved type; the form
    // values then follow from the `definitionType` effect below.
    if (isTypeChangeStaged && initialDefinitionType) {
      setDefinitionType(initialDefinitionType);
      return;
    }
    reset(getInitialFormValues());
  }, [isTypeChangeStaged, initialDefinitionType, setDefinitionType, reset, getInitialFormValues]);

  const renderDefinitionForm = () => {
    if (!definitionType) return null;

    return (
      <form onSubmit={handleFormSubmit} className='space-y-4'>
        <DataMartDefinitionForm
          definitionType={definitionType}
          storageType={storageType}
          storageId={storageId}
          storageConfig={storageConfig}
          preset={preset?.connectorSourceTitle}
          initialDefinitionType={initialDefinitionType}
          saveDataMartDefinition={handleFormSubmit}
        />
        {definitionType !== DataMartDefinitionType.CONNECTOR && (
          <div className='flex items-center gap-4'>
            <Button variant={'default'} type='submit' disabled={!isValid || !isDirty}>
              Save
            </Button>
            <Button
              type='button'
              variant='ghost'
              onClick={handleReset}
              disabled={!isDirty && !isTypeChangeStaged}
            >
              Discard
            </Button>

            {/* SQL Validator for SQL definition type */}
            {definitionType === DataMartDefinitionType.SQL && sqlCode && (
              <>
                <div className='bg-muted h-6 w-px'></div>
                <SqlValidator
                  // We remount validator by key when storage-change token increments,
                  // so SQL dry-run is re-triggered after storage edit sheet closes.
                  key={`${dataMartId}-${String(sqlRevalidateVersion ?? 0)}`}
                  sql={sqlCode}
                  dataMartId={dataMartId}
                  onValidationStateChange={handleValidationStateChange}
                />
              </>
            )}
          </div>
        )}
      </form>
    );
  };

  return (
    <FormProvider {...methods}>
      <div className='space-y-4'>
        {canChangeDefinitionType && (
          <DataMartDefinitionTypeSelector
            initialType={definitionType}
            onTypeSelect={handleTypeSelect}
            excludedTypes={
              initialDefinitionType ? [DataMartDefinitionType.CONNECTOR] : EMPTY_EXCLUDED_TYPES
            }
            savedType={initialDefinitionType}
          />
        )}
        {isTypeChangeStaged && (
          <div
            role='status'
            className='text-muted-foreground rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm'
          >
            Pick a new source and save to apply the change. Relationships, reports and field
            metadata are kept. Fields that are missing from the new source will be marked as
            disconnected.
          </div>
        )}
        {renderDefinitionForm()}
        {pendingTypeChange && initialDefinitionType && (
          <ChangeInputSourceTypeDialog
            open
            fromType={initialDefinitionType}
            toType={pendingTypeChange.definitionType}
            impact={impact}
            isLoadingImpact={isLoadingImpact}
            impactFailed={impactFailed}
            onRetryImpact={retryImpact}
            onConfirm={handleConfirmTypeChange}
            onCancel={() => {
              setPendingTypeChange(null);
            }}
          />
        )}
      </div>
    </FormProvider>
  );
}
