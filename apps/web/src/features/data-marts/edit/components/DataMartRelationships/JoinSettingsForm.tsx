import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Separator } from '@owox/ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { ExternalLink, Info, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { z } from 'zod';
import { Button } from '../../../../../shared/components/Button';
import { Combobox } from '../../../../../shared/components/Combobox/combobox';
import { useProjectRoute } from '../../../../../shared/hooks/useProjectRoute';
import { useDebounce } from '../../../../../hooks/useDebounce';
import type { DataMartResponseDto } from '../../../shared';
import { dataMartService } from '../../../shared';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';

const joinConditionSchema = z.object({
  sourceFieldName: z.string().min(1, 'Source field is required'),
  targetFieldName: z.string().min(1, 'Related field is required'),
});

function buildJoinSettingsFormSchema(siblingAliasesRef: { current: Set<string> }) {
  return z.object({
    targetAlias: z
      .string()
      .min(1, 'Field prefix is required')
      .regex(/^[a-z0-9_]+$/, {
        message: 'Field prefix must contain only lowercase letters, numbers, and underscores',
      })
      .refine(val => !siblingAliasesRef.current.has(val), {
        message: 'This alias is already used by another joined data mart',
      }),
    joinConditions: z.array(joinConditionSchema).min(1, 'At least one join condition is required'),
  });
}

type JoinSettingsFormValues = z.infer<ReturnType<typeof buildJoinSettingsFormSchema>>;

interface FlatField {
  name: string;
  type: string;
  isHiddenForReporting?: boolean;
}

interface RawSchemaField {
  name: string;
  type: string;
  isHiddenForReporting?: boolean;
  fields?: RawSchemaField[];
}

function flattenFields(fields: RawSchemaField[], prefix = ''): FlatField[] {
  const result: FlatField[] = [];
  for (const field of fields) {
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.fields && field.fields.length > 0) {
      result.push(...flattenFields(field.fields, fullName));
    } else {
      result.push({
        name: fullName,
        type: field.type,
        isHiddenForReporting: field.isHiddenForReporting,
      });
    }
  }
  return result;
}

function getSchemaFields(dm: DataMartResponseDto | null): FlatField[] {
  if (dm?.schema == null) return [];
  return flattenFields(dm.schema.fields as RawSchemaField[]);
}

function getInitialDefaults(relationship: DataMartRelationship): JoinSettingsFormValues {
  return {
    targetAlias: relationship.targetAlias,
    joinConditions:
      relationship.joinConditions.length > 0
        ? relationship.joinConditions
        : [{ sourceFieldName: '', targetFieldName: '' }],
  };
}

interface JoinSettingsFormProps {
  relationship: DataMartRelationship;
  dataMartId: string;
  readOnly?: boolean;
  /** Aliases used by other relationships that share the same source data mart. */
  siblingAliases: string[];
  /**
   * When set, the join is inherited from a parent data mart and must be edited there.
   * Renders an informational banner with a link to the parent.
   */
  inheritedFrom?: { id: string; title: string } | null;
  onSaved: (updated: DataMartRelationship) => void;
}

export function JoinSettingsForm({
  relationship,
  dataMartId,
  readOnly = false,
  siblingAliases,
  inheritedFrom,
  onSaved,
}: JoinSettingsFormProps) {
  const { scope } = useProjectRoute();
  const [sourceDM, setSourceDM] = useState<DataMartResponseDto | null>(null);
  const [targetDM, setTargetDM] = useState<DataMartResponseDto | null>(null);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Zod's `refine` closes over a ref so the schema instance stays stable while the
  // set of taken aliases changes. Paired with `form.trigger` below to re-validate
  // when siblings are added or renamed.
  const siblingAliasesRef = useRef<Set<string>>(new Set(siblingAliases));
  const formSchema = useMemo(() => buildJoinSettingsFormSchema(siblingAliasesRef), []);

  const form = useForm<JoinSettingsFormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: getInitialDefaults(relationship),
  });

  useEffect(() => {
    siblingAliasesRef.current = new Set(siblingAliases);
    void form.trigger('targetAlias');
  }, [siblingAliases, form]);

  // Track saved/attempted state per field so targetAlias can autosave even while
  // joinConditions are incomplete (e.g. "Join not configured" relationships).
  const lastSavedRef = useRef({
    targetAlias: relationship.targetAlias,
    joinConditionsKey: JSON.stringify(relationship.joinConditions),
  });
  const lastAttemptedRef = useRef(lastSavedRef.current);

  const {
    fields: joinFields,
    append: appendJoin,
    remove: removeJoin,
  } = useFieldArray({
    control: form.control,
    name: 'joinConditions',
  });

  useEffect(() => {
    form.reset(getInitialDefaults(relationship));
    const snapshot = {
      targetAlias: relationship.targetAlias,
      joinConditionsKey: JSON.stringify(relationship.joinConditions),
    };
    lastSavedRef.current = snapshot;
    lastAttemptedRef.current = snapshot;
  }, [relationship, form]);

  useEffect(() => {
    // Inherited (transient) rows don't own the join — source schema must come from the actual
    // relationship owner (`relationship.sourceDataMart.id`), not the data mart being viewed.
    const sourceId = relationship.sourceDataMart.id;
    if (!sourceId || !relationship.targetDataMart.id) return;
    setIsLoadingSchemas(true);
    void Promise.all([
      dataMartService.getDataMartById(sourceId),
      dataMartService.getDataMartById(relationship.targetDataMart.id),
    ])
      .then(([src, tgt]) => {
        setSourceDM(src);
        setTargetDM(tgt);
      })
      .finally(() => {
        setIsLoadingSchemas(false);
      });
  }, [relationship.sourceDataMart.id, relationship.targetDataMart.id]);

  const sourceFields = getSchemaFields(sourceDM);
  const targetFields = getSchemaFields(targetDM);

  const watchedValues = form.watch();
  const watchedKey = JSON.stringify(watchedValues);

  const joinTypeMismatches = useMemo(
    () =>
      watchedValues.joinConditions.map(jc => {
        if (!jc.sourceFieldName || !jc.targetFieldName) return null;
        const sourceType = sourceFields.find(f => f.name === jc.sourceFieldName)?.type;
        const targetType = targetFields.find(f => f.name === jc.targetFieldName)?.type;
        if (!sourceType || !targetType) return null;
        return sourceType !== targetType ? { sourceType, targetType } : null;
      }),
    [watchedValues.joinConditions, sourceFields, targetFields]
  );
  const hasTypeMismatch = joinTypeMismatches.some(Boolean);

  const debouncedKey = useDebounce(watchedKey, 800);

  useEffect(() => {
    if (readOnly || isSaving) return;

    let parsed: JoinSettingsFormValues;
    try {
      parsed = JSON.parse(debouncedKey) as JoinSettingsFormValues;
    } catch {
      return;
    }

    const parsedJoinKey = JSON.stringify(parsed.joinConditions);
    const hasAliasError = !!form.formState.errors.targetAlias;
    const joinsAreComplete =
      parsed.joinConditions.length > 0 &&
      parsed.joinConditions.every(jc => jc.sourceFieldName && jc.targetFieldName);

    const aliasIsNew =
      parsed.targetAlias !== lastSavedRef.current.targetAlias &&
      parsed.targetAlias !== lastAttemptedRef.current.targetAlias;
    const joinsAreNew =
      parsedJoinKey !== lastSavedRef.current.joinConditionsKey &&
      parsedJoinKey !== lastAttemptedRef.current.joinConditionsKey;

    const payload: {
      targetAlias?: string;
      joinConditions?: JoinSettingsFormValues['joinConditions'];
    } = {};
    if (aliasIsNew && !hasAliasError) {
      payload.targetAlias = parsed.targetAlias;
    }
    if (joinsAreNew && joinsAreComplete && !hasTypeMismatch) {
      payload.joinConditions = parsed.joinConditions;
    }
    if (Object.keys(payload).length === 0) return;

    // Mirror the payload into attempted refs so a failed save cannot loop on the
    // same value (see original guard), while leaving untouched fields intact so
    // they still eligible for their own autosave path.
    lastAttemptedRef.current = {
      targetAlias: payload.targetAlias ?? lastAttemptedRef.current.targetAlias,
      joinConditionsKey: payload.joinConditions
        ? parsedJoinKey
        : lastAttemptedRef.current.joinConditionsKey,
    };
    setIsSaving(true);

    dataMartRelationshipService
      .updateRelationship(dataMartId, relationship.id, payload, { skipErrorToast: true })
      .then(updated => {
        lastSavedRef.current = {
          targetAlias: updated.targetAlias,
          joinConditionsKey: JSON.stringify(updated.joinConditions),
        };
        onSaved(updated);
      })
      .catch(() => {
        toast.error('Failed to save join settings', {
          id: `join-save-error-${relationship.id}`,
        });
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [
    debouncedKey,
    hasTypeMismatch,
    readOnly,
    isSaving,
    dataMartId,
    relationship.id,
    onSaved,
    form,
  ]);

  return (
    <div className='flex flex-col gap-4 p-4'>
      {inheritedFrom && (
        <div className='flex min-w-0 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'>
          <Info className='size-4 shrink-0' />
          <p className='min-w-0 flex-1 truncate leading-snug'>
            Inherited from <span className='font-semibold'>{inheritedFrom.title}</span> — edit join
            there.
          </p>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-7 shrink-0 bg-white/80 text-xs dark:bg-white/5'
            onClick={() => {
              window.open(scope(`/data-marts/${inheritedFrom.id}/data-setup`), '_blank');
            }}
          >
            <ExternalLink className='size-3.5' />
            <span className='max-w-[200px] truncate'>Open {inheritedFrom.title}</span>
          </Button>
        </div>
      )}
      <Form {...form}>
        <FormField
          control={form.control}
          name='targetAlias'
          render={({ field }) => (
            <FormItem
              variant='light'
              className='bg-muted/50 flex flex-col gap-1.5 rounded-md p-3 dark:bg-white/5'
            >
              <label className='flex items-center gap-1.5 text-sm font-medium'>
                SQL Alias
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className='text-muted-foreground/50 hover:text-muted-foreground shrink-0 transition-colors'>
                      <Info className='size-4 shrink-0' />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side='top' className='max-w-xs'>
                    Internal name used when building the SQL JOIN for this data mart (e.g.
                    orders_customer_id). Not shown in the output.
                  </TooltipContent>
                </Tooltip>
              </label>
              <FormControl>
                <Input
                  {...field}
                  placeholder='e.g. orders'
                  disabled={readOnly}
                  className='bg-background h-8 text-sm dark:bg-white/5'
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        {/* Join Fields section */}
        <div className='flex flex-col gap-3'>
          <div className='flex shrink-0 items-center justify-between'>
            <p className='flex items-center gap-1.5 text-sm font-medium'>
              Join Fields
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className='text-muted-foreground/50 hover:text-muted-foreground shrink-0 transition-colors'>
                    <Info className='size-4 shrink-0' />
                  </span>
                </TooltipTrigger>
                <TooltipContent side='top' className='max-w-xs'>
                  Define how rows are matched between the source and related data marts.
                </TooltipContent>
              </Tooltip>
            </p>
            {!readOnly && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => {
                  appendJoin({ sourceFieldName: '', targetFieldName: '' });
                }}
              >
                <Plus className='mr-1 h-3.5 w-3.5' />
                Add Join Field
              </Button>
            )}
          </div>

          {joinFields.map((jf, index) => {
            const mismatch = joinTypeMismatches[index];
            return (
              <div key={jf.id} className='flex flex-col gap-1'>
                <div className='flex items-start gap-2'>
                  <FormField
                    control={form.control}
                    name={`joinConditions.${index}.sourceFieldName`}
                    render={({ field }) => (
                      <FormItem variant='light' className='min-w-0 flex-1'>
                        <FormLabel className={cn(index > 0 && 'sr-only')}>Source field</FormLabel>
                        <FormControl>
                          <Combobox
                            options={sourceFields.map(f => ({
                              value: f.name,
                              label: f.name,
                            }))}
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder='Select field...'
                            disabled={readOnly || isLoadingSchemas}
                            className={cn(mismatch && 'border-destructive')}
                            renderLabel={option => {
                              const f = sourceFields.find(sf => sf.name === option.value);
                              return (
                                <span className='flex min-w-0 flex-1 items-center justify-between gap-2'>
                                  <span className='truncate'>{option.label}</span>
                                  {f && (
                                    <span className='text-muted-foreground shrink-0 text-xs'>
                                      {f.type}
                                    </span>
                                  )}
                                </span>
                              );
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div
                    className={cn(
                      'text-muted-foreground flex items-center text-base font-semibold',
                      index === 0 ? 'mt-7' : 'mt-2'
                    )}
                  >
                    =
                  </div>

                  <FormField
                    control={form.control}
                    name={`joinConditions.${index}.targetFieldName`}
                    render={({ field }) => (
                      <FormItem variant='light' className='min-w-0 flex-1'>
                        <FormLabel className={cn(index > 0 && 'sr-only')}>Related field</FormLabel>
                        <FormControl>
                          <Combobox
                            options={targetFields.map(f => ({
                              value: f.name,
                              label: f.name,
                            }))}
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder='Select field...'
                            disabled={readOnly || isLoadingSchemas}
                            className={cn(mismatch && 'border-destructive')}
                            renderLabel={option => {
                              const f = targetFields.find(tf => tf.name === option.value);
                              return (
                                <span className='flex min-w-0 flex-1 items-center justify-between gap-2'>
                                  <span className='truncate'>{option.label}</span>
                                  {f && (
                                    <span className='text-muted-foreground shrink-0 text-xs'>
                                      {f.type}
                                    </span>
                                  )}
                                </span>
                              );
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {!readOnly && joinFields.length > 1 && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        removeJoin(index);
                      }}
                      className={cn(
                        'text-destructive hover:text-destructive',
                        index === 0 ? 'mt-7' : 'mt-2'
                      )}
                      aria-label='Remove join condition'
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  )}
                </div>

                {mismatch != null && (
                  <p className='text-destructive text-xs'>
                    Type mismatch: source is {mismatch.sourceType}, target is {mismatch.targetType}
                  </p>
                )}
              </div>
            );
          })}

          {form.formState.errors.joinConditions?.root && (
            <p className='text-destructive text-sm'>
              {form.formState.errors.joinConditions.root.message}
            </p>
          )}
        </div>
      </Form>
    </div>
  );
}
