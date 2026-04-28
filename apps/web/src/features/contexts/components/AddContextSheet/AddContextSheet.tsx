import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Textarea } from '@owox/ui/components/textarea';
import {
  AppForm,
  Form,
  FormActions,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormLayout,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { contextService } from '../../services/context.service';
import { MembersCheckboxList } from '../../../../shared/components/MembersCheckboxList';
import { getRoleDisplayName } from '../../../idp/utils/role-display-name';
import type { ContextDto, MemberWithScopeDto } from '../../types/context.types';

const addContextSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or fewer'),
  description: z.string().optional(),
});

type AddContextFormValues = z.infer<typeof addContextSchema>;

const DEFAULT_VALUES: AddContextFormValues = { name: '', description: '' };

interface AddContextSheetProps {
  isOpen: boolean;
  members: MemberWithScopeDto[];
  onClose: () => void;
  onCreated: (created: ContextDto) => void;
}

export function AddContextSheet({ isOpen, members, onClose, onCreated }: AddContextSheetProps) {
  const form = useForm<AddContextFormValues>({
    resolver: zodResolver(addContextSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  });
  const { control, handleSubmit, formState, reset: resetForm } = form;
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    resetForm(DEFAULT_VALUES);
    setSelectedMemberIds([]);
  }, [resetForm]);

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleToggleMember = (userId: string, checked: boolean) => {
    setSelectedMemberIds(prev => (checked ? [...prev, userId] : prev.filter(id => id !== userId)));
  };

  const onSubmit = useCallback(
    async (values: AddContextFormValues) => {
      setSaving(true);
      try {
        const trimmedDescription = values.description?.trim();
        const payload: { name: string; description?: string } = {
          name: values.name.trim(),
        };
        // Don't send empty-string description — backend treats it as a
        // distinct value from "absent". `??` would not collapse '' to
        // undefined; an explicit guard is the cleanest way to express
        // "either present or omitted entirely".
        if (trimmedDescription) {
          payload.description = trimmedDescription;
        }
        const created = await contextService.createContext(payload);

        if (selectedMemberIds.length > 0) {
          await contextService.updateContextMembers(created.id, selectedMemberIds);
        }

        toast.success('Context created');
        reset();
        onCreated(created);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to create context');
      } finally {
        setSaving(false);
      }
    },
    [selectedMemberIds, onCreated, reset]
  );

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) handleClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add context</SheetTitle>
          <SheetDescription>
            Create a business-domain context and optionally assign members to it.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <AppForm
            onSubmit={e => {
              void handleSubmit(onSubmit)(e);
            }}
          >
            <FormLayout>
              <FormSection title='General' name='add-context-general'>
                <FormField
                  control={control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel tooltip='Business-domain label shown on resources'>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder='Marketing' disabled={saving} autoFocus />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel tooltip='Helps members understand what resources belong to this context'>
                        Description (optional)
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={3}
                          disabled={saving}
                          placeholder='What this context represents'
                        />
                      </FormControl>
                      <FormMessage />
                      <Accordion variant='common' type='single' collapsible>
                        <AccordionItem value='add-ctx-help'>
                          <AccordionTrigger className='text-sm'>
                            What is a context?
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className='text-muted-foreground text-sm'>
                              A context is a business-domain label (e.g. Marketing, Finance) that
                              you can attach to Data Marts, Storages, Destinations and members.
                              Non-admin members with "Selected contexts" scope can only access
                              resources that share at least one of their contexts.
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </FormItem>
                  )}
                />
              </FormSection>

              {members.length > 0 && (
                <FormSection title='Members' name='add-context-members'>
                  <FormItem>
                    <FormLabel tooltip='Members you select here will get access to resources tagged with this context'>
                      Assign to members (optional)
                    </FormLabel>
                    <MembersCheckboxList
                      idPrefix='new-ctx-mem'
                      members={members.map(m => ({
                        userId: m.userId,
                        email: m.email,
                        displayName: m.displayName,
                        avatarUrl: m.avatarUrl,
                        role: m.role,
                        roleLabel: getRoleDisplayName(m.role),
                      }))}
                      selectedIds={selectedMemberIds}
                      onToggle={handleToggleMember}
                      disabled={saving}
                    />
                  </FormItem>
                </FormSection>
              )}
            </FormLayout>

            <FormActions>
              <Button type='submit' className='w-full' disabled={saving || !formState.isValid}>
                {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                Create
              </Button>
              <Button
                type='button'
                variant='outline'
                className='w-full'
                onClick={handleClose}
                disabled={saving}
              >
                Cancel
              </Button>
            </FormActions>
          </AppForm>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
