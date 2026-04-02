import { useCallback, useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@owox/ui/components/dialog';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@owox/ui/components/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Input } from '@owox/ui/components/input';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Separator } from '@owox/ui/components/separator';
import { cn } from '@owox/ui/lib/utils';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../../../shared/components/Button';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import { dataMartService } from '../../../shared/services/data-mart.service';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';
import type { DataMartResponseDto } from '../../../shared/types/api';
import type { BaseSchemaField } from '../../../shared/types/data-mart-schema.types';

const AGGREGATE_FUNCTIONS = ['STRING_AGG', 'MAX', 'MIN', 'SUM', 'COUNT', 'ANY_VALUE'] as const;

const joinConditionSchema = z.object({
  sourceFieldName: z.string().min(1, 'Source field is required'),
  targetFieldName: z.string().min(1, 'Target field is required'),
});

const blendedFieldSchema = z.object({
  targetFieldName: z.string(),
  outputAlias: z.string().min(1, 'Output alias is required'),
  isHidden: z.boolean(),
  aggregateFunction: z.string(),
  selected: z.boolean(),
});

const relationshipFormSchema = z.object({
  targetDataMartId: z.string().min(1, 'Target Data Mart is required'),
  targetAlias: z
    .string()
    .min(1, 'Alias is required')
    .regex(/^[a-z0-9_]+$/, {
      message: 'Alias must contain only lowercase letters, numbers, and underscores',
    }),
  joinConditions: z.array(joinConditionSchema).min(1, 'At least one join condition is required'),
  blendedFields: z.array(blendedFieldSchema),
});

type RelationshipFormValues = z.infer<typeof relationshipFormSchema>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getSchemaFields(dm: DataMartResponseDto | null): BaseSchemaField[] {
  if (dm?.schema == null) return [];
  return dm.schema.fields as BaseSchemaField[];
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
      blendedFields: [],
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

  const { fields: blendedFields } = useFieldArray({
    control: form.control,
    name: 'blendedFields',
  });

  const watchedTargetId = form.watch('targetDataMartId');
  const watchedBlendedFields = form.watch('blendedFields');

  // Load available DMs and source DM schema
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

  // Populate form when editing
  useEffect(() => {
    if (!open || relationship == null) return;

    form.reset({
      targetDataMartId: relationship.targetDataMart.id,
      targetAlias: relationship.targetAlias,
      joinConditions: relationship.joinConditions,
      blendedFields: relationship.blendedFields.map(f => ({
        ...f,
        selected: true,
      })),
    });
  }, [open, relationship, form]);

  // Load target DM schema when target changes
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

        // Only rebuild blended fields for new relationship or when target changes
        const isTargetChanged = relationship?.targetDataMart.id !== watchedTargetId;
        if (relationship == null || isTargetChanged) {
          const alias = form.getValues('targetAlias') || slugify(dm.title);
          if (!form.getValues('targetAlias')) {
            form.setValue('targetAlias', alias);
          }

          const fields = getSchemaFields(dm);
          form.setValue(
            'blendedFields',
            fields.map(f => ({
              targetFieldName: f.name,
              outputAlias: `${alias}_${f.name}`,
              isHidden: false,
              aggregateFunction: 'STRING_AGG',
              selected: true,
            }))
          );
        }
      } finally {
        setIsLoadingTarget(false);
      }
    })();
  }, [watchedTargetId, relationship, form]);

  // Auto-update output aliases when alias changes (only for new relationship)
  const handleAliasChange = useCallback(
    (newAlias: string) => {
      if (isEdit) return;
      const current = form.getValues('blendedFields');
      if (!current.length) return;

      const updated = current.map(f => ({
        ...f,
        outputAlias: `${newAlias}_${f.targetFieldName}`,
      }));
      form.setValue('blendedFields', updated);
    },
    [form, isEdit]
  );

  const handleSubmit = form.handleSubmit(async values => {
    setIsSaving(true);
    try {
      const selectedBlended = values.blendedFields
        .filter(f => f.selected)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ selected: _selected, ...rest }) => rest);

      const payload = {
        targetDataMartId: values.targetDataMartId,
        targetAlias: values.targetAlias,
        joinConditions: values.joinConditions,
        blendedFields: selectedBlended,
      };

      if (isEdit && relationship != null) {
        await dataMartRelationshipService.updateRelationship(dataMartId, relationship.id, payload);
      } else {
        await dataMartRelationshipService.createRelationship(dataMartId, payload);
      }

      onSaved();
      onOpenChange(false);
      form.reset();
    } finally {
      setIsSaving(false);
    }
  });

  const sourceFields = getSchemaFields(sourceDM);
  const targetFields = getSchemaFields(targetDM);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] max-w-2xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Relationship' : 'Add Relationship'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={e => {
              void handleSubmit(e);
            }}
            className='flex flex-col gap-6'
          >
            {/* Target Data Mart */}
            <FormField
              control={form.control}
              name='targetDataMartId'
              render={({ field }) => (
                <FormItem variant='light'>
                  <FormLabel>Target Data Mart</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isEdit || isLoadingDMs}
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Select a Data Mart...' />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDMs.map(dm => (
                          <SelectItem key={dm.id} value={dm.id}>
                            {dm.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Alias */}
            <FormField
              control={form.control}
              name='targetAlias'
              render={({ field }) => (
                <FormItem variant='light'>
                  <FormLabel>Alias</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder='e.g. orders'
                      onChange={e => {
                        field.onChange(e);
                        handleAliasChange(e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Join Conditions */}
            <div className='flex flex-col gap-3'>
              <div className='flex items-center justify-between'>
                <p className='text-sm font-medium'>Join Conditions</p>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    appendJoin({ sourceFieldName: '', targetFieldName: '' });
                  }}
                >
                  <Plus className='mr-1 h-3.5 w-3.5' />
                  Add Condition
                </Button>
              </div>

              {joinFields.map((jf, index) => (
                <div key={jf.id} className='flex items-start gap-2'>
                  <FormField
                    control={form.control}
                    name={`joinConditions.${index}.sourceFieldName`}
                    render={({ field }) => (
                      <FormItem variant='light' className='flex-1'>
                        {index === 0 && <FormLabel>Source field</FormLabel>}
                        <FormControl>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className='w-full'>
                              <SelectValue placeholder='Select field...' />
                            </SelectTrigger>
                            <SelectContent>
                              {sourceFields.map(f => (
                                <SelectItem key={f.name} value={f.name}>
                                  {f.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className={cn('flex items-center', index === 0 ? 'mt-7' : 'mt-2')}>
                    <span className='text-muted-foreground text-sm'>=</span>
                  </div>

                  <FormField
                    control={form.control}
                    name={`joinConditions.${index}.targetFieldName`}
                    render={({ field }) => (
                      <FormItem variant='light' className='flex-1'>
                        {index === 0 && <FormLabel>Target field</FormLabel>}
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={!watchedTargetId || isLoadingTarget}
                          >
                            <SelectTrigger className='w-full'>
                              <SelectValue placeholder='Select field...' />
                            </SelectTrigger>
                            <SelectContent>
                              {targetFields.map(f => (
                                <SelectItem key={f.name} value={f.name}>
                                  {f.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      removeJoin(index);
                    }}
                    disabled={joinFields.length === 1}
                    className={cn(
                      'text-destructive hover:text-destructive',
                      index === 0 ? 'mt-7' : 'mt-2'
                    )}
                    aria-label='Remove join condition'
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                  </Button>
                </div>
              ))}
              {form.formState.errors.joinConditions?.root && (
                <p className='text-destructive text-sm'>
                  {form.formState.errors.joinConditions.root.message}
                </p>
              )}
            </div>

            <Separator />

            {/* Blended Fields */}
            <div className='flex flex-col gap-3'>
              <p className='text-sm font-medium'>Blended Fields</p>

              {isLoadingTarget && (
                <p className='text-muted-foreground text-sm'>Loading target schema...</p>
              )}

              {!isLoadingTarget && blendedFields.length === 0 && watchedTargetId && (
                <p className='text-muted-foreground text-sm'>
                  No fields available in the target Data Mart schema.
                </p>
              )}

              {!watchedTargetId && (
                <p className='text-muted-foreground text-sm'>
                  Select a target Data Mart to configure blended fields.
                </p>
              )}

              {blendedFields.length > 0 && (
                <div className='rounded-md border'>
                  {/* Header */}
                  <div className='grid grid-cols-[auto_1fr_1fr_auto_auto] items-center gap-2 border-b px-3 py-2 text-xs font-medium text-gray-500'>
                    <span className='w-4' />
                    <span>Field name</span>
                    <span>Output alias</span>
                    <span>Aggregate</span>
                    <span>Hidden</span>
                  </div>

                  {blendedFields.map((bf, index) => (
                    <div
                      key={bf.id}
                      className='grid grid-cols-[auto_1fr_1fr_auto_auto] items-center gap-2 border-b px-3 py-2 last:border-b-0'
                    >
                      {/* Select checkbox */}
                      <FormField
                        control={form.control}
                        name={`blendedFields.${index}.selected`}
                        render={({ field }) => (
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            aria-label={`Include field ${bf.targetFieldName}`}
                          />
                        )}
                      />

                      {/* Field name */}
                      <span className='truncate text-sm'>{bf.targetFieldName}</span>

                      {/* Output alias */}
                      <FormField
                        control={form.control}
                        name={`blendedFields.${index}.outputAlias`}
                        render={({ field }) => (
                          <Input
                            {...field}
                            className='h-7 text-xs'
                            disabled={!watchedBlendedFields[index].selected}
                          />
                        )}
                      />

                      {/* Aggregate function */}
                      <FormField
                        control={form.control}
                        name={`blendedFields.${index}.aggregateFunction`}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={!watchedBlendedFields[index].selected}
                          >
                            <SelectTrigger size='sm' className='w-28'>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AGGREGATE_FUNCTIONS.map(fn => (
                                <SelectItem key={fn} value={fn}>
                                  {fn}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />

                      {/* Hidden toggle */}
                      <FormField
                        control={form.control}
                        name={`blendedFields.${index}.isHidden`}
                        render={({ field }) => (
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!watchedBlendedFields[index].selected}
                            aria-label={`Hide field ${bf.targetFieldName}`}
                          />
                        )}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
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
              <Button type='submit' disabled={isSaving}>
                {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Relationship'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
