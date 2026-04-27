import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
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
  Form,
  FormActions,
  FormItem,
  FormLabel,
  FormLayout,
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
import type { ContextDto, MemberWithScopeDto } from '../../types/context.types';

interface AddContextSheetProps {
  isOpen: boolean;
  members: MemberWithScopeDto[];
  onClose: () => void;
  onCreated: (created: ContextDto) => void;
}

export function AddContextSheet({ isOpen, members, onClose, onCreated }: AddContextSheetProps) {
  const form = useForm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setDescription('');
    setSelectedMemberIds([]);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleToggleMember = (userId: string, checked: boolean) => {
    setSelectedMemberIds(prev => (checked ? [...prev, userId] : prev.filter(id => id !== userId)));
  };

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const created = await contextService.createContext({
        name: trimmed,
        description: description.trim() || undefined,
      });

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
  }, [name, description, selectedMemberIds, onCreated]);

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
          <FormLayout>
            <FormSection title='General' name='add-context-general'>
              <FormItem>
                <FormLabel
                  htmlFor='new-ctx-name'
                  tooltip='Business-domain label shown on resources'
                >
                  Name
                </FormLabel>
                <Input
                  id='new-ctx-name'
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                  }}
                  placeholder='Marketing'
                  disabled={saving}
                  autoFocus
                />
              </FormItem>

              <FormItem>
                <FormLabel
                  htmlFor='new-ctx-description'
                  tooltip='Helps members understand what resources belong to this context'
                >
                  Description (optional)
                </FormLabel>
                <Textarea
                  id='new-ctx-description'
                  value={description}
                  onChange={e => {
                    setDescription(e.target.value);
                  }}
                  rows={3}
                  disabled={saving}
                  placeholder='What this context represents'
                />
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value='add-ctx-help'>
                    <AccordionTrigger className='text-sm'>What is a context?</AccordionTrigger>
                    <AccordionContent>
                      <p className='text-muted-foreground text-sm'>
                        A context is a business-domain label (e.g. Marketing, Finance) that you can
                        attach to Data Marts, Storages, Destinations and members. Non-admin members
                        with "Selected contexts" scope can only access resources that share at least
                        one of their contexts.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormItem>
            </FormSection>

            {members.length > 0 && (
              <FormSection title='Members' name='add-context-members'>
                <FormItem>
                  <FormLabel tooltip='Members you select here will get access to resources tagged with this context'>
                    Assign to members (optional)
                  </FormLabel>
                  <MembersCheckboxList
                    idPrefix='new-ctx-mem'
                    members={members}
                    selectedIds={selectedMemberIds}
                    onToggle={handleToggleMember}
                    disabled={saving}
                  />
                </FormItem>
              </FormSection>
            )}
          </FormLayout>

          <FormActions>
            <Button
              type='button'
              className='w-full'
              onClick={() => {
                void handleCreate();
              }}
              disabled={saving || name.trim().length === 0}
            >
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
        </Form>
      </SheetContent>
    </Sheet>
  );
}
