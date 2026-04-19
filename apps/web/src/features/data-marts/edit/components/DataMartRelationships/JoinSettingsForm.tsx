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
import { useEffect, useRef, useState } from 'react';
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

const joinSettingsFormSchema = z.object({
  targetAlias: z
    .string()
    .min(1, 'Field prefix is required')
    .regex(/^[a-z0-9_]+$/, {
      message: 'Field prefix must contain only lowercase letters, numbers, and underscores',
    }),
  joinConditions: z.array(joinConditionSchema).min(1, 'At least one join condition is required'),
});

type JoinSettingsFormValues = z.infer<typeof joinSettingsFormSchema>;

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
  inheritedFrom,
  onSaved,
}: JoinSettingsFormProps) {
  const { scope } = useProjectRoute();
  const [sourceDM, setSourceDM] = useState<DataMartResponseDto | null>(null);
  const [targetDM, setTargetDM] = useState<DataMartResponseDto | null>(null);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<JoinSettingsFormValues>({
    resolver: zodResolver(joinSettingsFormSchema),
    mode: 'onChange',
    defaultValues: getInitialDefaults(relationship),
  });

  const lastSavedKeyRef = useRef<string>(JSON.stringify(getInitialDefaults(relationship)));
  const lastAttemptedKeyRef = useRef<string>(JSON.stringify(getInitialDefaults(relationship)));

  const {
    fields: joinFields,
    append: appendJoin,
    remove: removeJoin,
  } = useFieldArray({
    control: form.control,
    name: 'joinConditions',
  });

  useEffect(() => {
    const defaults = getInitialDefaults(relationship);
    const key = JSON.stringify(defaults);
    form.reset(defaults);
    lastSavedKeyRef.current = key;
    lastAttemptedKeyRef.current = key;
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

  const joinTypeMismatches = watchedValues.joinConditions.map(jc => {
    if (!jc.sourceFieldName || !jc.targetFieldName) return null;
    const sourceType = sourceFields.find(f => f.name === jc.sourceFieldName)?.type;
    const targetType = targetFields.find(f => f.name === jc.targetFieldName)?.type;
    if (!sourceType || !targetType) return null;
    return sourceType !== targetType ? { sourceType, targetType } : null;
  });
  const hasTypeMismatch = joinTypeMismatches.some(Boolean);

  const debouncedKey = useDebounce(watchedKey, 800);
  const isValid = form.formState.isValid;

  useEffect(() => {
    if (readOnly || isSaving || !isValid || hasTypeMismatch) return;
    if (debouncedKey === lastSavedKeyRef.current) return;
    // Without this guard a failed save keeps `lastSavedKeyRef` stale, so the
    // next `isSaving=false` flip would re-run the effect and repost the same
    // payload in a tight loop — a wall of error toasts the user cannot escape.
    if (debouncedKey === lastAttemptedKeyRef.current) return;

    let parsed: JoinSettingsFormValues;
    try {
      parsed = JSON.parse(debouncedKey) as JoinSettingsFormValues;
    } catch {
      return;
    }

    lastAttemptedKeyRef.current = debouncedKey;
    setIsSaving(true);

    dataMartRelationshipService
      .updateRelationship(
        dataMartId,
        relationship.id,
        {
          targetAlias: parsed.targetAlias,
          joinConditions: parsed.joinConditions,
        },
        { skipErrorToast: true }
      )
      .then(updated => {
        lastSavedKeyRef.current = JSON.stringify({
          targetAlias: updated.targetAlias,
          joinConditions: updated.joinConditions,
        });
        onSaved(updated);
      })
      .catch(() => {
        // Suppress stale errors: the user may have already moved past this
        // payload by the time the rejection arrives.
        if (JSON.stringify(form.getValues()) === lastAttemptedKeyRef.current) {
          toast.error('Failed to save join settings', {
            id: `join-save-error-${relationship.id}`,
          });
        }
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [
    debouncedKey,
    hasTypeMismatch,
    readOnly,
    isSaving,
    isValid,
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
      {/* SQL Alias — internal, used for SQL JOIN construction. Target DM identity now lives
          in the tabs row above, so this section only holds the SQL alias editor. Keep the
          50/50 grid so the editor stays right-aligned and matches the Output Alias layout
          in the Report Fields tab. */}
      <Form {...form}>
        <div className='grid grid-cols-2 gap-3'>
          <div />
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
        </div>

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
