import { Button } from '@owox/ui/components/button';
import { TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { useOutletContext } from 'react-router';
import type {
  AthenaSchemaField,
  BigQuerySchemaField,
  DatabricksSchemaField,
  DataMartSchema,
  RedshiftSchemaField,
  SnowflakeSchemaField,
} from '../../../shared/types/data-mart-schema.types';
import type { BlendedField } from '../../../shared/types/relationship.types';
import type { DataMartContextType } from '../../model/context/types.ts';
import { useOperationState, useSchemaState } from './hooks';
import { SchemaContent } from './SchemaContent';
import { DataMartDefinitionType, DataMartMetadataScope } from '../../../shared/index.ts';
import { useAiHelper, useAiHelperAvailability } from '../../model/hooks';
import type { ResolvedSchema } from '../../model/hooks';
import type { SchemaToolbar } from './types/schema-toolbar';
import {
  useCalculatedFieldSave,
  type ViolationsByField,
} from './calculated/useCalculatedFieldSave';
import {
  JoinedFormulaFieldsContext,
  type JoinedFormulaFields,
} from './calculated/joined-fields-context';
import { useBlendableSchema } from '../../../shared/hooks/useBlendableSchema';
import { useInvalidateBlendableSchema } from '../../../shared/hooks/useInvalidateBlendableSchema';
import {
  CalculatedFieldIssuesContext,
  type CalculatedFieldIssues,
} from './calculated/calculated-field-issues-context';
import { FormulaDataMartIdContext } from './calculated/formula-data-mart-context';
import {
  collectDraftCalculatedFields,
  DraftCalculatedFieldsContext,
} from './calculated/draft-calculated-fields';
import { resolveCalculatedFieldIssues } from '../../../shared/utils/calculated-field-issues';

interface DataMartSchemaSettingsProps {
  definitionType: DataMartDefinitionType | null;
}

/** Scopes generated from the "Generate field metadata with AI" dropdown. */
type BulkAiScope =
  | DataMartMetadataScope.ALL_FIELD_METADATA
  | DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS
  | DataMartMetadataScope.ALL_FIELD_ALIASES;

const EMPTY_JOINED_FIELDS: BlendedField[] = [];

const normalizeMetadataValue = (value: string | undefined): string => value?.trim() ?? '';

const isFilled = (value: string | undefined): boolean => normalizeMetadataValue(value) !== '';

interface EditableMetadataField {
  name: string;
  alias?: string;
  description?: string;
}

type GeneratedMetadata = Pick<EditableMetadataField, 'alias' | 'description'>;

type MutableFieldArray<T extends readonly EditableMetadataField[]> =
  T extends readonly (infer TField extends EditableMetadataField)[] ? TField[] : never;

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
function mergeGeneratedMetadata<TFields extends readonly EditableMetadataField[]>(
  currentFields: TFields,
  originalFields: readonly EditableMetadataField[],
  generatedByName: ReadonlyMap<string, GeneratedMetadata>,
  props: readonly ('alias' | 'description')[]
): { fields: MutableFieldArray<TFields>; changed: boolean; duplicateNamesSkipped: boolean };
function mergeGeneratedMetadata(
  currentFields: readonly EditableMetadataField[],
  originalFields: readonly EditableMetadataField[],
  generatedByName: ReadonlyMap<string, GeneratedMetadata>,
  props: readonly ('alias' | 'description')[]
): { fields: EditableMetadataField[]; changed: boolean; duplicateNamesSkipped: boolean } {
  const originalByName = new Map(originalFields.map(field => [field.name, field]));
  // Fields, generated results, and the pre-generation snapshot are all matched by
  // name (there is no stable field id). Names are user-editable and can briefly
  // collide, so a duplicated name can't be attributed to a specific row - skip
  // those to avoid applying AI output to the wrong field.
  const currentNameCounts = countByName(currentFields);
  const originalNameCounts = countByName(originalFields);
  let changed = false;
  let duplicateNamesSkipped = false;
  const fields = currentFields.map(field => {
    const gen = generatedByName.get(field.name);
    if (!gen) return field;
    if (currentNameCounts.get(field.name) !== 1 || originalNameCounts.get(field.name) !== 1) {
      duplicateNamesSkipped = true;
      return field;
    }
    const original = originalByName.get(field.name);
    let next = field;
    for (const prop of props) {
      const value = gen[prop];
      const unchanged =
        !original || normalizeMetadataValue(field[prop]) === normalizeMetadataValue(original[prop]);
      if (value && !isFilled(field[prop]) && unchanged) {
        next = { ...next, [prop]: value };
        changed = true;
      }
    }
    return next;
  });
  return { fields, changed, duplicateNamesSkipped };
}

function showBulkMergeFeedback(
  scope: BulkAiScope,
  changed: boolean,
  duplicateNamesSkipped: boolean
): void {
  if (duplicateNamesSkipped) {
    toast(
      changed
        ? 'Some fields were skipped because duplicate field names cannot be matched reliably.'
        : 'No generated field metadata was applied because duplicate field names cannot be matched reliably.'
    );
    return;
  }
  if (changed) return;

  switch (scope) {
    case DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS:
      toast(
        'No field descriptions were applied. Values may already be filled or fields may have changed during generation.'
      );
      break;
    case DataMartMetadataScope.ALL_FIELD_ALIASES:
      toast(
        'No field aliases were applied. Values may already be filled or fields may have changed during generation.'
      );
      break;
    case DataMartMetadataScope.ALL_FIELD_METADATA:
      toast(
        'No field aliases or descriptions were applied. Values may already be filled or fields may have changed during generation.'
      );
      break;
  }
}

/**
 * Renders a `field → messages` map as one list per field. Every violation the backend sent shows
 * (the backend reports the whole set, not just the first one it finds) — a field with two
 * violations gets two bullets, not one.
 */
function ViolationsByFieldList({ violationsByField }: { violationsByField: ViolationsByField }) {
  return (
    <ul className='list-disc space-y-1 pl-5'>
      {Object.entries(violationsByField).map(([field, messages]) => (
        <li key={field}>
          <span className='font-semibold'>{field}</span>
          {messages.length === 1 ? (
            <span> — {messages[0]}</span>
          ) : (
            <ul className='list-disc space-y-0.5 pl-5'>
              {messages.map((message, index) => (
                // Messages aren't unique across violations; index is the only stable key here.
                <li key={index}>{message}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
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

  const { schema, isDirty, updateSchema, resetSchema, markSchemaSaved, keepUnsavedEdits } =
    useSchemaState(initialSchema);
  const { operationStatus, startSaveOperation, failSaveOperation } = useOperationState(
    isLoading,
    error
  );

  // `skipErrorToast` hands the 400/warnings from THIS call to useCalculatedFieldSave instead of
  // the generic apiClient interceptor toast — the hook below renders its own field-grouped
  // feedback, so the generic "Bad request" toast would just be a redundant second signal.
  const saveSchemaMutation = useCallback(
    (schemaToSave: DataMartSchema) =>
      updateDataMartSchema(dataMartId, schemaToSave, { skipErrorToast: true }),
    [updateDataMartSchema, dataMartId]
  );
  const {
    save: saveCalculatedFields,
    errorsByField,
    warningsByField,
    reset: resetCalculatedFieldFeedback,
  } = useCalculatedFieldSave(saveSchemaMutation);

  // The joined Data Marts' fields a calculated field's formula may reference. Read through the
  // shared query, so this page holds ONE copy of the blendable schema however many of its cards
  // need it, and a relationship change invalidated by any of them refreshes what the formula
  // editor offers too.
  //
  // The STATUS travels with them: an empty list from a failed request must not read as "this Data
  // Mart joins nothing", or the editor refuses a correct joined reference and blames the analyst
  // for it. A failure sticks for the life of the page (`retry: false`, `refetchOnWindowFocus:
  // false` in App.tsx), so this is not a momentary state that fixes itself.
  const { data: blendableSchema, isError } = useBlendableSchema(dataMartId);
  const joinedFormulaFields = useMemo<JoinedFormulaFields>(() => {
    if (blendableSchema) return { fields: blendableSchema.blendedFields, status: 'ready' };
    return { fields: EMPTY_JOINED_FIELDS, status: isError ? 'unavailable' : 'loading' };
  }, [blendableSchema, isError]);
  const invalidateBlendableSchema = useInvalidateBlendableSchema();

  // Which calculated fields are broken, for the status column — the backend's verdict on the
  // SAVED schema, narrowed to the metrics whose formula is still the one it judged. See
  // resolveCalculatedFieldIssues for why an unsaved formula must not be marked either way.
  const calculatedFieldIssues = useMemo<CalculatedFieldIssues>(
    () =>
      resolveCalculatedFieldIssues(
        blendableSchema?.calculatedFieldIssues,
        initialSchema?.fields,
        schema?.fields
      ),
    [blendableSchema, initialSchema, schema]
  );

  // The formulas the analyst is holding, for the formula editor's live check. This page defers its
  // save, so what is on screen and what is on disk are different lists — and a check answered from
  // the persisted one calls a sibling added in this session a field that no longer exists.
  const draftCalculatedFields = useMemo(
    () => collectDraftCalculatedFields(schema?.fields),
    [schema]
  );

  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  /**
   * Whether a save is out, and whether anything was applied on top of it. Recorded at the moment of
   * the edit rather than compared afterwards: the response's re-render and the promise continuation
   * that follows it are not ordered against each other, so by the time the continuation runs the
   * reset may already have replaced the very schema a comparison would have looked at.
   */
  const saveInFlightRef = useRef(false);
  const editedDuringSaveRef = useRef(false);
  const activeDataMartIdRef = useRef(dataMartId);
  activeDataMartIdRef.current = dataMartId;

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
  const showAiHelper = Boolean(isAiHelperEnabled) && !isConnector;

  // Reset schema when operation is successful — unless something was applied while the request was
  // in flight, which the schema that comes back does not contain.
  useEffect(() => {
    if (operationStatus !== 'success') return;
    if (editedDuringSaveRef.current) return;
    resetSchema();
  }, [operationStatus, resetSchema]);

  // Every schema edit this page makes goes through here, so an edit applied on top of an in-flight
  // save is recorded wherever it came from — a formula, a table cell, or bulk AI.
  const handleSchemaFieldsChange = useCallback(
    (
      newFields:
        | BigQuerySchemaField[]
        | AthenaSchemaField[]
        | SnowflakeSchemaField[]
        | RedshiftSchemaField[]
        | DatabricksSchemaField[]
    ) => {
      if (saveInFlightRef.current) {
        editedDuringSaveRef.current = true;
        keepUnsavedEdits(true);
      }
      updateSchema(newFields);
    },
    [updateSchema, keepUnsavedEdits]
  );

  // Handle save
  const handleSave = useCallback(() => {
    if (dataMartId && schema) {
      saveInFlightRef.current = true;
      editedDuringSaveRef.current = false;
      startSaveOperation();
      void saveCalculatedFields(schema)
        .then(() => {
          saveInFlightRef.current = false;
          invalidateBlendableSchema();
          // Actualization replaces the schema with the warehouse's own, which would take an edit
          // applied while the request was in flight with it — a second way to lose the same edit,
          // past the reset above.
          if (editedDuringSaveRef.current) return;
          void runSchemaActualization?.();
        })
        .catch(() => {
          saveInFlightRef.current = false;
          // A rejected save publishes no new schema, so there is nothing left to keep the edit
          // from — and a flag left raised would swallow the next one that does arrive.
          keepUnsavedEdits(false);
          // useCalculatedFieldSave already surfaced the failure — grouped by field below the
          // table, or (for a failure it can't attribute to a field) its own toast. failSaveOperation
          // tells useOperationState this was a failure directly, from the rejection caught right
          // here — see its own comment for why that must NOT go through the shared `error` state.
          failSaveOperation();
        });
    }
  }, [
    dataMartId,
    schema,
    startSaveOperation,
    saveCalculatedFields,
    runSchemaActualization,
    failSaveOperation,
    invalidateBlendableSchema,
    keepUnsavedEdits,
  ]);

  // Registered with the shared unsaved-changes guard. `guardSave` persists the
  // current schema WITHOUT triggering actualization (the guarded action may run
  // its own actualization/publish afterwards). `guardDiscard` reverts to the
  // saved schema and returns it so the guarded action maps onto the right fields.
  //
  // Routed through saveCalculatedFields (not updateDataMartSchema directly) so a save
  // triggered from this path — e.g. "Save and continue" before a guarded publish — gets the same
  // field-grouped errors/warnings as the main Save button, instead of stale feedback from
  // whatever the LAST main-button save left behind.
  const guardSave = useCallback(async (): Promise<ResolvedSchema> => {
    const current = schemaRef.current;
    if (dataMartId && current) {
      await saveCalculatedFields(current);
      markSchemaSaved(current);
      invalidateBlendableSchema();
    }
    return current;
  }, [dataMartId, saveCalculatedFields, markSchemaSaved, invalidateBlendableSchema]);

  const guardDiscard = useCallback((): ResolvedSchema => {
    resetSchema();
    // The reverted schema no longer matches whatever a previous save attempt complained about —
    // same reason the Discard button below clears it.
    resetCalculatedFieldFeedback();
    return initialSchema;
  }, [resetSchema, resetCalculatedFieldFeedback, initialSchema]);

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
    runGuarded?.(
      async () => {
        await runSchemaActualization?.();
        // Actualization PERSISTS a new schema — a column the warehouse no longer has is gone from it
        // — so it can break a formula exactly as a save can. Both save paths already invalidate; this
        // one did not, and the cached blendable schema kept answering from before the refresh: a
        // calculated field whose column had just disappeared went on showing its green
        // "formula resolves" marker until something else happened to refetch.
        invalidateBlendableSchema();
      },
      { intent: 'refresh' }
    );
  }, [runGuarded, runSchemaActualization, invalidateBlendableSchema]);

  // Handle discard
  const handleDiscard = useCallback(() => {
    resetSchema();
    // The reverted schema no longer matches whatever the last save attempt complained about.
    resetCalculatedFieldFeedback();
  }, [resetSchema, resetCalculatedFieldFeedback]);

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
      if (!generated || activeDataMartIdRef.current !== dataMartId) return;
      const byName = new Map(generated.map(f => [f.name, { description: f.description }]));
      const currentFields = schemaRef.current?.fields ?? targetSchema.fields;
      const { fields, changed, duplicateNamesSkipped } = mergeGeneratedMetadata(
        currentFields,
        targetSchema.fields,
        byName,
        ['description']
      );
      if (changed) handleSchemaFieldsChange(fields);
      showBulkMergeFeedback(
        DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS,
        changed,
        duplicateNamesSkipped
      );
    },
    [dataMartId, generateAllFieldDescriptions, handleSchemaFieldsChange]
  );

  const handleGenerateAllFieldAliases = useCallback(
    async (targetSchema: ResolvedSchema) => {
      if (!dataMartId || !targetSchema) return;
      const generated = await generateAllFieldAliases(dataMartId);
      if (!generated || activeDataMartIdRef.current !== dataMartId) return;
      const byName = new Map(generated.map(f => [f.name, { alias: f.alias }]));
      const currentFields = schemaRef.current?.fields ?? targetSchema.fields;
      const { fields, changed, duplicateNamesSkipped } = mergeGeneratedMetadata(
        currentFields,
        targetSchema.fields,
        byName,
        ['alias']
      );
      if (changed) handleSchemaFieldsChange(fields);
      showBulkMergeFeedback(
        DataMartMetadataScope.ALL_FIELD_ALIASES,
        changed,
        duplicateNamesSkipped
      );
    },
    [dataMartId, generateAllFieldAliases, handleSchemaFieldsChange]
  );

  const handleGenerateAllFieldMetadata = useCallback(
    async (targetSchema: ResolvedSchema) => {
      if (!dataMartId || !targetSchema) return;
      const generated = await generateAllFieldMetadata(dataMartId);
      if (!generated || activeDataMartIdRef.current !== dataMartId) return;
      const byName = new Map(
        generated.map(f => [f.name, { alias: f.alias, description: f.description }])
      );
      const currentFields = schemaRef.current?.fields ?? targetSchema.fields;
      const { fields, changed, duplicateNamesSkipped } = mergeGeneratedMetadata(
        currentFields,
        targetSchema.fields,
        byName,
        ['alias', 'description']
      );
      if (changed) handleSchemaFieldsChange(fields);
      showBulkMergeFeedback(
        DataMartMetadataScope.ALL_FIELD_METADATA,
        changed,
        duplicateNamesSkipped
      );
    },
    [dataMartId, generateAllFieldMetadata, handleSchemaFieldsChange]
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
  const isSchemaOperationInProgress = isLoading || Boolean(isSchemaActualizationLoading);
  const isAiBusy = aiPendingScope !== null;
  const hasFields = !!schema && schema.fields.length > 0;

  const schemaToolbar: SchemaToolbar = {
    showAiHelper,

    refresh: {
      disabled: !definitionType || isSchemaOperationInProgress,
      onClick: handleActualize,
    },

    ai: {
      disabled: !hasFields || isSchemaOperationInProgress || isAiBusy,
      loading: {
        metadata: aiPendingScope?.scope === DataMartMetadataScope.ALL_FIELD_METADATA,

        aliases: aiPendingScope?.scope === DataMartMetadataScope.ALL_FIELD_ALIASES,

        descriptions: aiPendingScope?.scope === DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS,
      },

      onGenerateMetadata: () => {
        runGuarded?.(resolved => runBulkAi(DataMartMetadataScope.ALL_FIELD_METADATA, resolved), {
          intent: 'ai',
        });
      },

      onGenerateDescriptions: () => {
        runGuarded?.(
          resolved => runBulkAi(DataMartMetadataScope.ALL_FIELD_DESCRIPTIONS, resolved),
          {
            intent: 'ai',
          }
        );
      },

      onGenerateAliases: () => {
        runGuarded?.(resolved => runBulkAi(DataMartMetadataScope.ALL_FIELD_ALIASES, resolved), {
          intent: 'ai',
        });
      },
    },
  };

  if (!dataMart) {
    return <div>Error: Data mart not found</div>;
  }

  return (
    <div className='space-y-4'>
      <JoinedFormulaFieldsContext.Provider value={joinedFormulaFields}>
        <CalculatedFieldIssuesContext.Provider value={calculatedFieldIssues}>
          <FormulaDataMartIdContext.Provider value={dataMartId}>
            <DraftCalculatedFieldsContext.Provider value={draftCalculatedFields}>
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
                schemaToolbar={schemaToolbar}
              />
            </DraftCalculatedFieldsContext.Provider>
          </FormulaDataMartIdContext.Provider>
        </CalculatedFieldIssuesContext.Provider>
      </JoinedFormulaFieldsContext.Provider>
      {Object.keys(errorsByField).length > 0 && (
        <div
          role='alert'
          className='border-destructive/30 bg-destructive/5 text-destructive space-y-1 rounded-md border px-3 py-2 text-sm'
        >
          <p className='font-medium'>Fix these calculated fields, then save again:</p>
          <ViolationsByFieldList violationsByField={errorsByField} />
        </div>
      )}
      {Object.keys(warningsByField).length > 0 && (
        // Saved successfully — amber, not red, and `status` (not `alert`) so this never reads as
        // a failure (unlike the destructive block above, which blocks the save). Still a polite
        // live region: worth announcing, just not as urgently as an error.
        <div
          role='status'
          className='flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
        >
          <TriangleAlert className='mt-0.5 size-4 shrink-0' />
          <div className='space-y-1'>
            <p className='font-medium'>Saved — worth a look:</p>
            <ViolationsByFieldList violationsByField={warningsByField} />
          </div>
        </div>
      )}
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

        <div className='flex items-center gap-2'></div>
      </div>
    </div>
  );
}
