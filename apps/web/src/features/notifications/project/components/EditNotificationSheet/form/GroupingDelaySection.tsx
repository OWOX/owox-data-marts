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
        <FieldLabel tooltip='How long to wait before sending grouped notifications'>
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
              <AccordionTrigger>What is this?</AccordionTrigger>
              <AccordionContent>
                Multiple notifications within this time window will be grouped into a single email
                to reduce inbox clutter. Only email notifications are grouped.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </FieldDescription>
      </FieldItem>
    </FormSection>
  );
}
