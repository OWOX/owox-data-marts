import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
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
import type { ResolvedSchema } from '../../model/hooks';

interface DataMartSchemaSettingsProps {
  definitionType: DataMartDefinitionType | null;
}

/** Scopes generated from the "Generate field metadata with AI" dropdown. */
type BulkAiScope =
  | DataMartMetadataScope.ALL_FIELD_METADATA
  | DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS
  | DataMartMetadataScope.ALL_FIELD_ALIASES;

const isFilled = (value: string | undefined): boolean => !!value && value.trim() !== '';

interface EditableMetadataField {
  name: string;
  alias?: string;
  description?: string;
}

type GeneratedMetadata = Pick<EditableMetadataField, 'alias' | 'description'>;

function countByName(fields: readonly EditableMetadataField[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const field of fields) {
    counts.set(field.name, (counts.get(field.name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Merges AI-generated alias/description values onto the live schema fields. A value
 * is applied only when the field's property is empty AND unchanged since the request
 * started (compared against `originalFields`), so edits or deliberate clears made
 * while the slow generation call was in flight are never overwritten. Unchanged
 * fields keep their original reference and `changed` reports whether anything was
 * applied, letting callers skip a no-op schema update.
 */
function mergeGeneratedMetadata(
  currentFields: readonly EditableMetadataField[],
  originalFields: readonly EditableMetadataField[],
  generatedByName: ReadonlyMap<string, GeneratedMetadata>,
  props: readonly ('alias' | 'description')[]
): { fields: EditableMetadataField[]; changed: boolean } {
  const originalByName = new Map(originalFields.map(field => [field.name, field]));
  // Fields, generated results, and the pre-generation snapshot are all matched by
  // name (there is no stable field id). Names are user-editable and can briefly
  // collide, so a duplicated name can't be attributed to a specific row - skip
  // those to avoid applying AI output to the wrong field.
  const currentNameCounts = countByName(currentFields);
  const originalNameCounts = countByName(originalFields);
  let changed = false;
  const fields = currentFields.map(field => {
    const gen = generatedByName.get(field.name);
    if (!gen) return field;
    if (currentNameCounts.get(field.name) !== 1 || originalNameCounts.get(field.name) !== 1) {
      return field;
    }
    const original = originalByName.get(field.name);
    let next = field;
    for (const prop of props) {
      const value = gen[prop];
      const unchanged = !original || field[prop] === original[prop];
      if (value && !isFilled(field[prop]) && unchanged) {
        next = { ...next, [prop]: value };
        changed = true;
      }
    }
    return next;
  });
  return { fields, changed };
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
    registerSchemaGuard,
    runGuarded,
  } = useOutletContext<DataMartContextType>();

  const { id: dataMartId = '', schema: initialSchema } = dataMart ?? {};

  const { schema, isDirty, updateSchema, resetSchema, markSchemaSaved } =
    useSchemaState(initialSchema);
  const { operationStatus, startSaveOperation } = useOperationState(isLoading, error);

  const schemaRef = useRef(schema);
  schemaRef.current = schema;

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
      void updateDataMartSchema(dataMartId, schema)
        .then(() => {
          void runSchemaActualization?.();
        })
        .catch(() => {
          // The context stores and displays the API error.
        });
    }
  }, [dataMartId, schema, startSaveOperation, updateDataMartSchema, runSchemaActualization]);

  // Registered with the shared unsaved-changes guard. `guardSave` persists the
  // current schema WITHOUT triggering actualization (the guarded action may run
  // its own actualization/publish afterwards). `guardDiscard` reverts to the
  // saved schema and returns it so the guarded action maps onto the right fields.
  const guardSave = useCallback(async (): Promise<ResolvedSchema> => {
    const current = schemaRef.current;
    if (dataMartId && current) {
      await updateDataMartSchema(dataMartId, current);
      markSchemaSaved(current);
    }
    return current;
  }, [dataMartId, updateDataMartSchema, markSchemaSaved]);

  const guardDiscard = useCallback((): ResolvedSchema => {
    resetSchema();
    return initialSchema;
  }, [resetSchema, initialSchema]);

  useEffect(() => {
    registerSchemaGuard?.({
      isDirty: () => isDirty,
      getSchema: () => schemaRef.current,
      save: guardSave,
      discard: guardDiscard,
    });
    return () => registerSchemaGuard?.(null);
  }, [isDirty, registerSchemaGuard, guardSave, guardDiscard]);

  // Handle actualize
  const handleActualize = useCallback(() => {
    runGuarded?.(() => runSchemaActualization?.(), { intent: 'refresh' });
  }, [runGuarded, runSchemaActualization]);

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

  // The three bulk handlers all merge generated metadata onto the current live
  // schema (schemaRef), preserving edits made during the slow generation call, and
  // skip the schema update entirely when nothing was applied. See mergeGeneratedMetadata.
  const handleGenerateAllFieldDescriptions = useCallback(
    async (targetSchema: ResolvedSchema) => {
      if (!dataMartId || !targetSchema) return;
      const generated = await generateAllFieldDescriptions(dataMartId);
      if (!generated) return;
      const byName = new Map(generated.map(f => [f.name, { description: f.description }]));
      const currentFields = schemaRef.current?.fields ?? targetSchema.fields;
      const { fields, changed } = mergeGeneratedMetadata(
        currentFields,
        targetSchema.fields,
        byName,
        ['description']
      );
      if (changed) updateSchema(fields as typeof targetSchema.fields);
    },
    [dataMartId, generateAllFieldDescriptions, updateSchema]
  );

  const handleGenerateAllFieldAliases = useCallback(
    async (targetSchema: ResolvedSchema) => {
      if (!dataMartId || !targetSchema) return;
      const generated = await generateAllFieldAliases(dataMartId);
      if (!generated) return;
      const byName = new Map(generated.map(f => [f.name, { alias: f.alias }]));
      const currentFields = schemaRef.current?.fields ?? targetSchema.fields;
      const { fields, changed } = mergeGeneratedMetadata(
        currentFields,
        targetSchema.fields,
        byName,
        ['alias']
      );
      if (changed) updateSchema(fields as typeof targetSchema.fields);
    },
    [dataMartId, generateAllFieldAliases, updateSchema]
  );

  const handleGenerateAllFieldMetadata = useCallback(
    async (targetSchema: ResolvedSchema) => {
      if (!dataMartId || !targetSchema) return;
      const generated = await generateAllFieldMetadata(dataMartId);
      if (!generated) return;
      const byName = new Map(
        generated.map(f => [f.name, { alias: f.alias, description: f.description }])
      );
      const currentFields = schemaRef.current?.fields ?? targetSchema.fields;
      const { fields, changed } = mergeGeneratedMetadata(
        currentFields,
        targetSchema.fields,
        byName,
        ['alias', 'description']
      );
      if (changed) updateSchema(fields as typeof targetSchema.fields);
    },
    [dataMartId, generateAllFieldMetadata, updateSchema]
  );

  // Bulk AI maps generated metadata onto the resolved schema (saved or discarded)
  // provided by the unsaved-changes guard, so unsaved edits are never silently used
  // against a stale field set.
  const runBulkAi = useCallback(
    async (scope: BulkAiScope, targetSchema: ResolvedSchema): Promise<void> => {
      switch (scope) {
        case DataMartMetadataScope.ALL_FIELD_METADATA:
          await handleGenerateAllFieldMetadata(targetSchema);
          break;
        case DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS:
          await handleGenerateAllFieldDescriptions(targetSchema);
          break;
        case DataMartMetadataScope.ALL_FIELD_ALIASES:
          await handleGenerateAllFieldAliases(targetSchema);
          break;
      }
    },
    [
      handleGenerateAllFieldMetadata,
      handleGenerateAllFieldDescriptions,
      handleGenerateAllFieldAliases,
    ]
  );

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
                    runGuarded?.(
                      resolved => runBulkAi(DataMartMetadataScope.ALL_FIELD_METADATA, resolved),
                      {
                        intent: 'ai',
                      }
                    );
                  }}
                >
                  <Sparkles className='mr-2 h-4 w-4' />
                  Generate field aliases & descriptions
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='cursor-pointer'
                  disabled={!hasFields || isAiBusy}
                  onClick={() => {
                    runGuarded?.(
                      resolved => runBulkAi(DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS, resolved),
                      {
                        intent: 'ai',
                      }
                    );
                  }}
                >
                  <Sparkles className='mr-2 h-4 w-4' />
                  Generate field descriptions
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='cursor-pointer'
                  disabled={!hasFields || isAiBusy}
                  onClick={() => {
                    runGuarded?.(
                      resolved => runBulkAi(DataMartMetadataScope.ALL_FIELD_ALIASES, resolved),
                      {
                        intent: 'ai',
                      }
                    );
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
