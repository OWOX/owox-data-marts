import { useState, useCallback, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@owox/ui/components/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Switch } from '@owox/ui/components/switch';
import { FormLayout, FormSection, FormItem, FormLabel, Form } from '@owox/ui/components/form';
import { useForm } from 'react-hook-form';
import { Button } from '../Button';

export type AvailabilityEntityType = 'data-mart' | 'storage' | 'destination';

interface AvailabilityField {
  key: string;
  sectionTitle: string;
  label: string;
  description: string;
  helpTitle: string;
  helpContent: string;
}

interface AvailabilitySheetProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: AvailabilityEntityType;
  entityTitle: string;
  initialValues: {
    field1: boolean;
    field2: boolean;
  };
  onSave: (field1: boolean, field2: boolean) => Promise<void>;
}

function getAvailabilityFields(
  entityType: AvailabilityEntityType
): [AvailabilityField, AvailabilityField] {
  if (entityType === 'data-mart') {
    return [
      {
        key: 'availableForReporting',
        sectionTitle: 'Reporting',
        label: 'Available for reporting',
        description: 'All project members can see this Data Mart and build reports on it',
        helpTitle: 'What does "Available for reporting" mean?',
        helpContent:
          'When enabled, all project members (both Technical and Business Users) can see this Data Mart in the catalog and use it to create reports. Owners always have access regardless of this setting. Disable this to restrict visibility to owners only.',
      },
      {
        key: 'availableForMaintenance',
        sectionTitle: 'Maintenance',
        label: 'Available for maintenance',
        description: 'Technical users can edit, delete, and manage triggers for this Data Mart',
        helpTitle: 'What does "Available for maintenance" mean?',
        helpContent:
          'When enabled, Technical Users who are not owners can edit the Data Mart definition, delete it, and manage its scheduled triggers. Business Users are not affected by this setting — they cannot perform maintenance actions regardless. Use this when you want other Technical Users on your team to help manage this Data Mart.',
      },
    ];
  }

  const entityName = entityType === 'storage' ? 'storage' : 'destination';

  return [
    {
      key: 'availableForUse',
      sectionTitle: 'Usage',
      label: 'Available for use',
      description:
        entityType === 'storage'
          ? 'Technical users can use this storage when creating Data Marts'
          : 'Project members can use this destination in their reports',
      helpTitle: `What does "Available for use" mean?`,
      helpContent:
        entityType === 'storage'
          ? 'When enabled, Technical Users who are not owners can select this storage when creating new Data Marts. Without this, only storage owners and admins can use it. Enable this when multiple team members need to build Data Marts on the same storage.'
          : 'When enabled, project members can select this destination when configuring reports. Without this, only destination owners and admins can use it. Enable this when your team shares a common reporting destination.',
    },
    {
      key: 'availableForMaintenance',
      sectionTitle: 'Maintenance',
      label: 'Available for maintenance',
      description: `Project members with access can copy credentials, edit, and delete this ${entityName}`,
      helpTitle: 'What does "Available for maintenance" mean?',
      helpContent: `When enabled, project members can copy credentials from this ${entityName}, edit its configuration, and delete it. This is useful when multiple team members need to manage shared infrastructure. Without this, only owners and admins can perform these actions.`,
    },
  ];
}

function getSheetTitle(entityType: AvailabilityEntityType): string {
  switch (entityType) {
    case 'data-mart':
      return 'Share Data Mart';
    case 'storage':
      return 'Share Storage';
    case 'destination':
      return 'Share Destination';
  }
}

export function AvailabilitySheet({
  isOpen,
  onClose,
  entityType,
  entityTitle,
  initialValues,
  onSave,
}: AvailabilitySheetProps) {
  const form = useForm();
  const [field1, setField1] = useState(initialValues.field1);
  const [field2, setField2] = useState(initialValues.field2);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setField1(initialValues.field1);
    setField2(initialValues.field2);
  }, [initialValues.field1, initialValues.field2]);

  const hasChanges = field1 !== initialValues.field1 || field2 !== initialValues.field2;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(field1, field2);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [field1, field2, onSave, onClose]);

  const fields = getAvailabilityFields(entityType);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <SheetContent side='right' className='w-[400px]'>
        <SheetHeader>
          <SheetTitle>{getSheetTitle(entityType)}</SheetTitle>
          <SheetDescription>{entityTitle}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <FormLayout>
            <FormSection title={fields[0].sectionTitle} collapsible={false}>
              <FormItem>
                <div className='flex items-center justify-between gap-4'>
                  <FormLabel>{fields[0].label}</FormLabel>
                  <Switch id={fields[0].key} checked={field1} onCheckedChange={setField1} />
                </div>
                <p className='text-muted-foreground text-xs'>{fields[0].description}</p>
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value={`${fields[0].key}-help`}>
                    <AccordionTrigger className='text-sm'>{fields[0].helpTitle}</AccordionTrigger>
                    <AccordionContent>
                      <p className='text-muted-foreground text-sm'>{fields[0].helpContent}</p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormItem>
            </FormSection>

            <FormSection title={fields[1].sectionTitle} collapsible={false}>
              <FormItem>
                <div className='flex items-center justify-between gap-4'>
                  <FormLabel>{fields[1].label}</FormLabel>
                  <Switch id={fields[1].key} checked={field2} onCheckedChange={setField2} />
                </div>
                <p className='text-muted-foreground text-xs'>{fields[1].description}</p>
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value={`${fields[1].key}-help`}>
                    <AccordionTrigger className='text-sm'>{fields[1].helpTitle}</AccordionTrigger>
                    <AccordionContent>
                      <p className='text-muted-foreground text-sm'>{fields[1].helpContent}</p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormItem>
            </FormSection>
          </FormLayout>
        </Form>

        <SheetFooter className='px-6'>
          <Button onClick={() => void handleSave()} disabled={!hasChanges || isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant='outline' onClick={onClose}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
