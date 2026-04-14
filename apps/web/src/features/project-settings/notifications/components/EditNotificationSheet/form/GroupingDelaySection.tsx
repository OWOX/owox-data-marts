import { FormSection } from '@owox/ui/components/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { FieldItem, FieldLabel, FieldDescription } from './FormField';
import { GROUPING_DELAY_OPTIONS } from '../../../types';

interface GroupingDelaySectionProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function GroupingDelaySection({ value, onChange, disabled }: GroupingDelaySectionProps) {
  return (
    <FormSection title='Delay'>
      <FieldItem>
        <FieldLabel tooltip='Select how long to wait before sending a grouped email'>
          Grouping multiple notifications
        </FieldLabel>
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPING_DELAY_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          <Accordion variant='common' type='single' collapsible>
            <AccordionItem value='grouping-delay-info'>
              <AccordionTrigger>How grouping works?</AccordionTrigger>
              <AccordionContent>
                If multiple notifications are triggered within this time window, they are sent as a
                single email to keep your inbox tidy. Only email notifications are grouped.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </FieldDescription>
      </FieldItem>
    </FormSection>
  );
}
