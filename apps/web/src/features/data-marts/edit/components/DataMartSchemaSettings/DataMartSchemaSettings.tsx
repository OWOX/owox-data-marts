import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type {
  AthenaSchemaField,
  BigQuerySchemaField,
  DatabricksSchemaField,
  RedshiftSchemaField,
  SnowflakeSchemaField,
} from '../../../shared/types/data-mart-schema.types';
import type { DataMartContextType } from '../../model/context/types.ts';
import { useOperationState, useSchemaState } from './hooks';
import { SchemaContent } from './SchemaContent';
import { DataMartDefinitionType, DataMartMetadataScope } from '../../../shared/index.ts';
import { useAiHelper, useAiHelperAvailability } from '../../model/hooks';

interface DataMartSchemaSettingsProps {
  definitionType: DataMartDefinitionType | null;
}
/**
 * Main component for editing data mart schema settings
 * Uses custom hooks for state management and the SchemaContent component for rendering
 */
export function DataMartSchemaSettings({ definitionType }: DataMartSchemaSettingsProps) {
  const {
    dataMart,
    updateDataMartSchema,
    isLoading,
    error,
    runSchemaActualization,
    isSchemaActualizationLoading,
  } = useOutletContext<DataMartContextType>();

  const { id: dataMartId = '', schema: initialSchema } = dataMart ?? {};

  const { schema, isDirty, updateSchema, resetSchema } = useSchemaState(initialSchema);
  const { operationStatus, startSaveOperation } = useOperationState(isLoading, error);

  const { enabled: isAiHelperEnabled } = useAiHelperAvailability();
  const {
    generateFieldAlias,
    generateFieldDescription,
    generateAllFieldDescriptions,
    generateAllFieldAliases,
    generateAllFieldMetadata,
    pendingScope: aiPendingScope,
  } = useAiHelper();
  // Backend rejects metadata generation for CONNECTOR data marts; hide the buttons
  // so the user is never offered an action that's guaranteed to 422.
  const isConnector = definitionType === DataMartDefinitionType.CONNECTOR;
  const showAiHelper = isAiHelperEnabled && !isConnector;

  // Reset schema when operation is successful
  useEffect(() => {
    if (operationStatus === 'success') {
      resetSchema();
    }
  }, [operationStatus, resetSchema]);

  // Handle schema fields change
  const handleSchemaFieldsChange = useCallback(
    (
      newFields:
        | BigQuerySchemaField[]
        | AthenaSchemaField[]
        | SnowflakeSchemaField[]
        | RedshiftSchemaField[]
        | DatabricksSchemaField[]
    ) => {
      updateSchema(newFields);
    },
    [updateSchema]
  );

  // Handle save
  const handleSave = useCallback(() => {
    if (dataMartId && schema) {
      startSaveOperation();
      void updateDataMartSchema(dataMartId, schema).then(() => {
        void runSchemaActualization?.();
      });
    }
  }, [dataMartId, schema, startSaveOperation, updateDataMartSchema, runSchemaActualization]);

  // Handle actualize
  const handleActualize = useCallback(() => {
    void runSchemaActualization?.();
  }, [runSchemaActualization]);

  // Handle discard
  const handleDiscard = useCallback(() => {
    resetSchema();
  }, [resetSchema]);

  // Per-field AI handlers return the generated value WITHOUT mutating schema.
  // The open EditableText popover writes the value into its local buffer via the
  // `editorAction` render-fn so the user sees it in the textarea and must Apply or
  // Cancel explicitly.
  const handleGenerateFieldAlias = useCallback(
    async (fieldName: string): Promise<string | undefined> => {
      if (!dataMartId) return undefined;
      return generateFieldAlias(dataMartId, fieldName);
    },
    [dataMartId, generateFieldAlias]
  );

  const handleGenerateFieldDescription = useCallback(
    async (fieldName: string): Promise<string | undefined> => {
      if (!dataMartId) return undefined;
      return generateFieldDescription(dataMartId, fieldName);
    },
    [dataMartId, generateFieldDescription]
  );

  const isFilled = (value: string | undefined): boolean => !!value && value.trim() !== '';

  const handleGenerateAllFieldDescriptions = useCallback(async () => {
    if (!dataMartId || !schema) return;
    const generated = await generateAllFieldDescriptions(dataMartId);
    if (!generated) return;
    const byName = new Map(generated.map(field => [field.name, field.description]));
    const updated = schema.fields.map(field => {
      if (isFilled(field.description)) return field;
      const description = byName.get(field.name);
      return description ? { ...field, description } : field;
    });
    updateSchema(updated as typeof schema.fields);
  }, [dataMartId, schema, generateAllFieldDescriptions, updateSchema]);

  const handleGenerateAllFieldAliases = useCallback(async () => {
    if (!dataMartId || !schema) return;
    const generated = await generateAllFieldAliases(dataMartId);
    if (!generated) return;
    const byName = new Map(generated.map(field => [field.name, field.alias]));
    const updated = schema.fields.map(field => {
      if (isFilled(field.alias)) return field;
      const alias = byName.get(field.name);
      return alias ? { ...field, alias } : field;
    });
    updateSchema(updated as typeof schema.fields);
  }, [dataMartId, schema, generateAllFieldAliases, updateSchema]);

  const handleGenerateAllFieldMetadata = useCallback(async () => {
    if (!dataMartId || !schema) return;
    const generated = await generateAllFieldMetadata(dataMartId);
    if (!generated) return;
    const byName = new Map(generated.map(field => [field.name, field]));
    const updated = schema.fields.map(field => {
      const gen = byName.get(field.name);
      if (!gen) return field;
      const next = { ...field };
      if (!isFilled(field.alias) && gen.alias) next.alias = gen.alias;
      if (!isFilled(field.description) && gen.description) next.description = gen.description;
      return next;
    });
    updateSchema(updated as typeof schema.fields);
  }, [dataMartId, schema, generateAllFieldMetadata, updateSchema]);

  // Disable buttons during schema operations (save or actualization)
  const isSchemaOperationInProgress = isLoading || isSchemaActualizationLoading;
  const isAiBusy = aiPendingScope !== null;
  const isBulkAiBusy =
    aiPendingScope?.scope === DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS ||
    aiPendingScope?.scope === DataMartMetadataScope.ALL_FIELD_ALIASES ||
    aiPendingScope?.scope === DataMartMetadataScope.ALL_FIELD_METADATA;
  const hasFields = !!schema && schema.fields.length > 0;

  if (!dataMart) {
    return <div>Error: Data mart not found</div>;
  }

  return (
    <div className='space-y-4'>
      <SchemaContent
        schema={schema}
        storageType={dataMart.storage.type}
        onFieldsChange={handleSchemaFieldsChange}
        aiHelper={
          showAiHelper
            ? {
                pendingScope: aiPendingScope,
                onGenerateFieldAlias: handleGenerateFieldAlias,
                onGenerateFieldDescription: handleGenerateFieldDescription,
              }
            : undefined
        }
      />
      <div className='align-items-center mt-4 flex justify-between'>
        <div className='flex items-center gap-2'>
          <Button
            variant={'default'}
            onClick={handleSave}
            disabled={!isDirty || isSchemaOperationInProgress}
          >
            Save
          </Button>
          <Button
            type='button'
            variant='ghost'
            onClick={handleDiscard}
            disabled={!isDirty || isSchemaOperationInProgress}
          >
            Discard
          </Button>
        </div>

        <div className='flex items-center gap-2'>
          {showAiHelper && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      disabled={!hasFields || Boolean(isSchemaOperationInProgress) || isAiBusy}
                      aria-label='Generate field metadata with AI'
                    >
                      {isBulkAiBusy ? (
                        <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
                      ) : (
                        <Sparkles className='h-4 w-4' aria-hidden='true' />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side='bottom'>Generate field metadata with AI</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  className='cursor-pointer'
                  disabled={!hasFields || isAiBusy}
                  onClick={() => {
                    void handleGenerateAllFieldMetadata();
                  }}
                >
                  <Sparkles className='mr-2 h-4 w-4' />
                  Generate field aliases & descriptions
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='cursor-pointer'
                  disabled={!hasFields || isAiBusy}
                  onClick={() => {
                    void handleGenerateAllFieldDescriptions();
                  }}
                >
                  <Sparkles className='mr-2 h-4 w-4' />
                  Generate field descriptions
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='cursor-pointer'
                  disabled={!hasFields || isAiBusy}
                  onClick={() => {
                    void handleGenerateAllFieldAliases();
                  }}
                >
                  <Sparkles className='mr-2 h-4 w-4' />
                  Generate field aliases
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            type='button'
            variant='outline'
            onClick={handleActualize}
            disabled={!definitionType || isSchemaOperationInProgress}
          >
            Refresh schema
          </Button>
        </div>
      </div>
    </div>
  );
}
