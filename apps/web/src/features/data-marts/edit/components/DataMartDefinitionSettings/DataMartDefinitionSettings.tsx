import { useState, useEffect, useCallback } from 'react';
import { useForm, FormProvider, type SubmitHandler, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DataMartDefinitionTypeSelector } from './form/DataMartDefinitionTypeSelector.tsx';
import { DataMartDefinitionForm } from './form/DataMartDefinitionForm.tsx';
import { DataMartDefinitionType } from '../../../shared';
import { useDataMartPreset } from '../../../shared/utils/useDataMartPreset.ts';
import {
  createDataMartDefinitionSchema,
  type DataMartDefinitionFormData,
} from '../../model/schema/data-mart-definition.schema.ts';
import { Button } from '@owox/ui/components/button';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../model/context/types.ts';
import { getEmptyDefinition } from '../../utils/definition-helpers.ts';
import SqlValidator from '../SqlValidator/SqlValidator.tsx';
import type { DataMartDefinitionConfigDto, SqlDefinitionConfig } from '../../model';

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

const getEmptyDefinitionForUpdate = (type: DataMartDefinitionType): DataMartDefinitionConfigDto =>
  getEmptyDefinition(type) as DataMartDefinitionConfigDto;

export function DataMartDefinitionSettings() {
  const { dataMart, updateDataMartDefinition, runSchemaActualization } =
    useOutletContext<DataMartContextType>();
  const preset = useDataMartPreset();

  if (!dataMart) {
    throw new Error('Data mart not found');
  }
  const {
    definitionType: initialDefinitionType,
    definition: initialDefinition,
    id: dataMartId,
    storage: { type: storageType },
  } = dataMart;

  const [definitionType, setDefinitionType] = useState<DataMartDefinitionType | null>(
    initialDefinitionType
  );
  const [, setSqlValidationState] = useState<SqlValidationState>(initialSqlValidationState);
  const [shouldActualizeSchema, setShouldActualizeSchema] = useState(false);

  const getInitialFormValues = useCallback((): DataMartDefinitionFormData | undefined => {
    if (!definitionType) return undefined;

    const emptyValues = {
      definitionType,
      definition: getEmptyDefinition(definitionType),
    };

    if (!initialDefinition) return emptyValues as DataMartDefinitionFormData;

    return {
      definitionType,
      definition: initialDefinition,
    } as DataMartDefinitionFormData;
  }, [definitionType, initialDefinition]);

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

  useEffect(() => {
    if (definitionType) {
      reset(getInitialFormValues());
    }
  }, [definitionType, reset, getInitialFormValues]);

  useEffect(() => {
    if (!definitionType && !initialDefinitionType && preset?.definitionType) {
      setDefinitionType(preset.definitionType);
      const initialValues = {
        definitionType: preset.definitionType,
        definition: getEmptyDefinitionForUpdate(preset.definitionType),
      } as DataMartDefinitionFormData;

      reset(initialValues);
    }
  }, [preset, definitionType, initialDefinitionType, reset]);

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

  const handleTypeSelect = useCallback((type: DataMartDefinitionType) => {
    setDefinitionType(type);
  }, []);

  const onSubmit: SubmitHandler<DataMartDefinitionFormData> = useCallback(
    async (data: DataMartDefinitionFormData) => {
      if (definitionType && dataMartId) {
        try {
          await updateDataMartDefinition(dataMartId, data.definitionType, data.definition);
          setShouldActualizeSchema(true);
          reset(data);
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

  const handleFormSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      void handleSubmit(onSubmit)(e);
    },
    [handleSubmit, onSubmit]
  );

  const handleReset = useCallback(() => {
    reset(getInitialFormValues());
  }, [reset, getInitialFormValues]);

  const renderDefinitionForm = () => {
    if (!definitionType) return null;

    return (
      <form onSubmit={handleFormSubmit} className='space-y-4'>
        <DataMartDefinitionForm
          definitionType={definitionType}
          storageType={storageType}
          preset={preset?.connectorSourceTitle}
          saveDataMartDefinition={handleFormSubmit}
        />
        {definitionType !== DataMartDefinitionType.CONNECTOR && (
          <div className='flex items-center gap-4'>
            <Button variant={'default'} type='submit' disabled={!isValid || !isDirty}>
              Save
            </Button>
            <Button type='button' variant='ghost' onClick={handleReset} disabled={!isDirty}>
              Discard
            </Button>

            {/* SQL Validator for SQL definition type */}
            {definitionType === DataMartDefinitionType.SQL && sqlCode && (
              <>
                <div className='h-6 w-px bg-gray-300'></div>
                <SqlValidator
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
        {!initialDefinitionType && (
          <DataMartDefinitionTypeSelector
            initialType={definitionType}
            onTypeSelect={handleTypeSelect}
          />
        )}
        {renderDefinitionForm()}
      </div>
    </FormProvider>
  );
}
