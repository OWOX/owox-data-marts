import { FormSection } from '@owox/ui/components/form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { RecipientsSelector } from './RecipientsSelector';
import { FieldItem, FieldLabel, FieldDescription } from '../form/FormField';
import type { ProjectMember } from '../../../types';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

interface RecipientsSectionProps {
  members: ProjectMember[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function RecipientsSection({
  members,
  selectedUserIds,
  onChange,
  isLoading,
  disabled,
}: RecipientsSectionProps) {
  return (
    <FormSection title='Recipients'>
      <FieldItem>
        <FieldLabel tooltip='Select team members who should receive notifications'>
          Team members
        </FieldLabel>
        <RecipientsSelector
          members={members}
          selectedUserIds={selectedUserIds}
          onChange={onChange}
          isLoading={isLoading}
          disabled={disabled}
        />
        <FieldDescription>
          <Accordion variant='common' type='single' collapsible>
            <AccordionItem value='recipients-info'>
              <AccordionTrigger>How to add new recipients to this notification?</AccordionTrigger>
              <AccordionContent>
                Only project members can receive notifications. To add new recipients, first invite
                them to the project through{' '}
                <ExternalAnchor href='https://platform.owox.com/ui/p/none/settings/members'>
                  Project Settings → Members
                </ExternalAnchor>{' '}
                page.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </FieldDescription>
      </FieldItem>
    </FormSection>
  );
}
