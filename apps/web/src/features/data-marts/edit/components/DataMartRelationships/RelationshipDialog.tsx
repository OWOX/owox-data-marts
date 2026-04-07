import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Combobox } from '../../../../../shared/components/Combobox/combobox';
import { Separator } from '@owox/ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { Info, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../../../../shared/components/Button';
import type { DataMartResponseDto } from '../../../shared';
import { dataMartService } from '../../../shared';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';

const joinConditionSchema = z.object({
  sourceFieldName: z.string().min(1, 'Source field is required'),
  targetFieldName: z.string().min(1, 'Related field is required'),
});

const relationshipFormSchema = z.object({
  targetDataMartId: z.string().min(1, 'Data Mart is required'),
  targetAlias: z
    .string()
    .min(1, 'Field prefix is required')
    .regex(/^[a-z0-9_]+$/, {
      message: 'Field prefix must contain only lowercase letters, numbers, and underscores',
    }),
  joinConditions: z.array(joinConditionSchema).min(1, 'At least one join condition is required'),
});

type RelationshipFormValues = z.infer<typeof relationshipFormSchema>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

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
    result.push({
      name: fullName,
      type: field.type,
      isHiddenForReporting: field.isHiddenForReporting,
    });
    if (field.fields && Array.isArray(field.fields)) {
      result.push(...flattenFields(field.fields, fullName));
    }
  }
  return result;
}

function getSchemaFields(dm: DataMartResponseDto | null): FlatField[] {
  if (dm?.schema == null) return [];
  return flattenFields(dm.schema.fields as RawSchemaField[]);
}

interface RelationshipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataMartId: string;
  storageId: string;
  relationship?: DataMartRelationship | null;
  onSaved: () => void;
}

export function RelationshipDialog({
  open,
  onOpenChange,
  dataMartId,
  storageId,
  relationship,
  onSaved,
}: RelationshipDialogProps) {
  const isEdit = Boolean(relationship);

  const [availableDMs, setAvailableDMs] = useState<{ id: string; title: string }[]>([]);
  const [sourceDM, setSourceDM] = useState<DataMartResponseDto | null>(null);
  const [targetDM, setTargetDM] = useState<DataMartResponseDto | null>(null);
  const [isLoadingDMs, setIsLoadingDMs] = useState(false);
  const [isLoadingTarget, setIsLoadingTarget] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<RelationshipFormValues>({
    resolver: zodResolver(relationshipFormSchema),
    defaultValues: {
      targetDataMartId: '',
      targetAlias: '',
      joinConditions: [{ sourceFieldName: '', targetFieldName: '' }],
    },
  });

  const {
    fields: joinFields,
    append: appendJoin,
    remove: removeJoin,
  } = useFieldArray({
    control: form.control,
    name: 'joinConditions',
  });

  const watchedTargetId = form.watch('targetDataMartId');

  useEffect(() => {
    if (!open) return;

    void (async () => {
      setIsLoadingDMs(true);
      try {
        const [allDMs, srcDM] = await Promise.all([
          dataMartService.getDataMarts(),
          dataMartService.getDataMartById(dataMartId),
        ]);

        setSourceDM(srcDM);

        const filtered = allDMs
          .filter(dm => dm.id !== dataMartId && dm.storage.title === srcDM.storage.title)
          .map(dm => ({ id: dm.id, title: dm.title }));

        setAvailableDMs(filtered);
      } finally {
        setIsLoadingDMs(false);
      }
    })();
  }, [open, dataMartId, storageId]);

  useEffect(() => {
    if (!open) return;

    if (relationship != null) {
      form.reset({
        targetDataMartId: relationship.targetDataMart.id,
        targetAlias: relationship.targetAlias,
        joinConditions: relationship.joinConditions,
      });
    } else {
      form.reset({
        targetDataMartId: '',
        targetAlias: '',
        joinConditions: [{ sourceFieldName: '', targetFieldName: '' }],
      });
      setTargetDM(null);
    }
  }, [open, relationship, form]);

  useEffect(() => {
    if (!watchedTargetId) {
      setTargetDM(null);
      return;
    }

    void (async () => {
      setIsLoadingTarget(true);
      try {
        const dm = await dataMartService.getDataMartById(watchedTargetId);
        setTargetDM(dm);

        if (!relationship) {
          form.setValue('targetAlias', slugify(dm.title));
        }
      } finally {
        setIsLoadingTarget(false);
      }
    })();
  }, [watchedTargetId, relationship, form]);

  const handleSubmit = form.handleSubmit(async values => {
    setIsSaving(true);
    try {
      const alias = values.targetAlias;
      const fields = getSchemaFields(targetDM).filter(f => !f.isHiddenForReporting);
      const blendedFields = fields.map(f => ({
        targetFieldName: f.name,
        outputAlias: `${alias}_${f.name}`,
        isHidden: false,
        aggregateFunction: 'STRING_AGG',
      }));

      if (relationship) {
        await dataMartRelationshipService.updateRelationship(dataMartId, relationship.id, {
          targetAlias: values.targetAlias,
          joinConditions: values.joinConditions,
          blendedFields,
        });
      } else {
        await dataMartRelationshipService.createRelationship(dataMartId, {
          targetDataMartId: values.targetDataMartId,
          targetAlias: values.targetAlias,
          joinConditions: values.joinConditions,
          blendedFields,
        });
      }

      onSaved();
      onOpenChange(false);
      form.reset();
    } catch (e) {
      // Error toast is shown by the global axios interceptor
      console.error('Error saving relationship', e);
    } finally {
      setIsSaving(false);
    }
  });

  const sourceFields = getSchemaFields(sourceDM);
  const targetFields = getSchemaFields(targetDM);

  const watchedJoinConditions = form.watch('joinConditions');
  const joinTypeMismatches = watchedJoinConditions.map(jc => {
    if (!jc.sourceFieldName || !jc.targetFieldName) return null;
    const sourceType = sourceFields.find(f => f.name === jc.sourceFieldName)?.type;
    const targetType = targetFields.find(f => f.name === jc.targetFieldName)?.type;
    if (!sourceType || !targetType) return null;
    return sourceType !== targetType ? { sourceType, targetType } : null;
  });
  const hasTypeMismatch = joinTypeMismatches.some(Boolean);

  function getSubmitLabel(): string {
    if (isSaving) return 'Saving...';
    if (isEdit) return 'Save Changes';
    return 'Add Relationship';
  }

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        onOpenChange(value);
        if (!value) {
          form.reset();
          setTargetDM(null);
        }
      }}
    >
      <DialogContent
        className='flex max-h-[90vh] !max-w-2xl flex-col overflow-hidden'
        onOpenAutoFocus={e => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Relationship' : 'Add Relationship'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={e => {
              void handleSubmit(e);
            }}
            className='flex min-h-0 flex-col gap-6 overflow-y-auto px-1'
          >
            <FormField
              control={form.control}
              name='targetDataMartId'
              render={({ field }) => (
                <FormItem variant='light'>
                  <FormLabel>
                    Data Mart{' '}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className='text-muted-foreground inline h-3.5 w-3.5 align-text-bottom' />
                      </TooltipTrigger>
                      <TooltipContent>
                        Select the data mart whose fields you want to blend into this one
                      </TooltipContent>
                    </Tooltip>
                  </FormLabel>
                  <FormControl>
                    <Combobox
                      options={availableDMs.map(dm => ({
                        value: dm.id,
                        label: dm.title,
                      }))}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder='Select a Data Mart...'
                      disabled={isEdit || isLoadingDMs}
                    />
                  </FormControl>
                  <FormMessage />
                  {watchedTargetId && !isLoadingTarget && targetDM && (
                    <p className='text-muted-foreground text-xs'>
                      {getSchemaFields(targetDM).filter(f => !f.isHiddenForReporting).length} fields
                      available for blending
                    </p>
                  )}
                  {isLoadingTarget && (
                    <p className='text-muted-foreground text-xs'>Loading schema...</p>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='targetAlias'
              render={({ field }) => (
                <FormItem variant='light'>
                  <FormLabel>
                    Field Prefix{' '}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className='text-muted-foreground inline h-3.5 w-3.5 align-text-bottom' />
                      </TooltipTrigger>
                      <TooltipContent>
                        Short name added before each blended field in the output schema
                      </TooltipContent>
                    </Tooltip>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder='e.g. orders' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div className='flex flex-col gap-3'>
              <div className='flex shrink-0 items-center justify-between'>
                <p className='flex items-center gap-1 text-sm font-medium'>
                  Join Fields
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className='text-muted-foreground h-3.5 w-3.5' />
                    </TooltipTrigger>
                    <TooltipContent>
                      Define how rows are matched between the source and related data marts
                    </TooltipContent>
                  </Tooltip>
                </p>
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
                            <FormLabel className={cn(index > 0 && 'sr-only')}>
                              Source field
                            </FormLabel>
                            <FormControl>
                              <Combobox
                                options={sourceFields.map(f => ({
                                  value: f.name,
                                  label: f.name,
                                }))}
                                value={field.value}
                                onValueChange={field.onChange}
                                placeholder='Select field...'
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

                      <div className={cn('flex items-center', index === 0 ? 'mt-8' : 'mt-2')}>
                        <span className='text-muted-foreground text-sm'>→</span>
                      </div>

                      <FormField
                        control={form.control}
                        name={`joinConditions.${index}.targetFieldName`}
                        render={({ field }) => (
                          <FormItem variant='light' className='min-w-0 flex-1'>
                            <FormLabel className={cn(index > 0 && 'sr-only')}>
                              Related field
                            </FormLabel>
                            <FormControl>
                              <Combobox
                                options={targetFields.map(f => ({
                                  value: f.name,
                                  label: f.name,
                                }))}
                                value={field.value}
                                onValueChange={field.onChange}
                                placeholder='Select field...'
                                disabled={!watchedTargetId || isLoadingTarget}
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

                      {joinFields.length > 1 && (
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
                        Type mismatch: source is {mismatch.sourceType}, target is{' '}
                        {mismatch.targetType}
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

            <DialogFooter className='bg-background sticky bottom-0 shrink-0 pt-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  onOpenChange(false);
                  form.reset();
                }}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={isSaving || hasTypeMismatch}>
                {getSubmitLabel()}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
