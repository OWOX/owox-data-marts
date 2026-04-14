import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { FormActions, FormItem, FormLayout, FormSection } from '@owox/ui/components/form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { contextService } from '../../services/context.service';
import { SheetLabel } from '../../../../shared/components/SheetLabel';
import { MembersCheckboxList } from '../../../../shared/components/MembersCheckboxList';
import type { ContextDto, MemberWithScopeDto } from '../../types/context.types';

interface ContextDetailsSheetProps {
  isOpen: boolean;
  context: ContextDto | null;
  members: MemberWithScopeDto[];
  onClose: () => void;
  onSaved: () => void;
}

export function ContextDetailsSheet({
  isOpen,
  context,
  members,
  onClose,
  onSaved,
}: ContextDetailsSheetProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const initialMemberIds = useMemo(() => {
    if (!context) return [] as string[];
    return members.filter(m => m.contextIds.includes(context.id)).map(m => m.userId);
  }, [context, members]);

  useEffect(() => {
    if (context) {
      setName(context.name);
      setDescription(context.description ?? '');
      setSelectedMemberIds(initialMemberIds);
    }
  }, [context, initialMemberIds]);

  const handleToggleMember = (userId: string, checked: boolean) => {
    setSelectedMemberIds(prev => (checked ? [...prev, userId] : prev.filter(id => id !== userId)));
  };

  const handleSave = useCallback(async () => {
    if (!context) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      await contextService.updateContext(context.id, {
        name: trimmedName,
        description: description.trim(),
      });

      await contextService.updateContextMembers(context.id, selectedMemberIds);

      toast.success('Context updated');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [context, name, description, selectedMemberIds, onSaved]);

  if (!context) return null;

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={open => {
          if (!open && !saving) onClose();
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{name || 'Context'}</SheetTitle>
            <SheetDescription>Edit context details and manage assigned members.</SheetDescription>
          </SheetHeader>

          <FormLayout>
            <FormSection title='General' name='ctx-details-general'>
              <FormItem>
                <SheetLabel htmlFor='ctx-name' tooltip='Business-domain label shown on resources'>
                  Name
                </SheetLabel>
                <Input
                  id='ctx-name'
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                  }}
                  disabled={saving}
                />
              </FormItem>

              <FormItem>
                <SheetLabel
                  htmlFor='ctx-description'
                  tooltip='Helps members understand what resources belong to this context'
                >
                  Description
                </SheetLabel>
                <Textarea
                  id='ctx-description'
                  value={description}
                  onChange={e => {
                    setDescription(e.target.value);
                  }}
                  rows={3}
                  disabled={saving}
                  placeholder='What this context represents'
                />
              </FormItem>
            </FormSection>

            <FormSection title='Members' name='ctx-details-members'>
              <FormItem>
                <SheetLabel tooltip='Non-admin members assigned to this context can access resources tagged with it'>
                  Assigned members
                </SheetLabel>
                <MembersCheckboxList
                  idPrefix='ctx-mem'
                  members={members}
                  selectedIds={selectedMemberIds}
                  onToggle={handleToggleMember}
                  disabled={saving}
                  emptyText='No non-admin members in this project yet.'
                />
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value='ctx-members-help'>
                    <AccordionTrigger className='text-sm'>
                      Why don't I see admins here?
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className='text-muted-foreground text-sm'>
                        Admins have project-wide scope and always see every resource, regardless of
                        context assignments. Only non-admin members need explicit context
                        assignments to control their visibility.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormItem>
            </FormSection>
          </FormLayout>

          <FormActions>
            <Button
              type='button'
              className='w-full'
              onClick={() => {
                void handleSave();
              }}
              disabled={saving}
            >
              {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Save
            </Button>
            <Button
              type='button'
              variant='outline'
              className='w-full'
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
          </FormActions>
        </SheetContent>
      </Sheet>
    </>
  );
}
