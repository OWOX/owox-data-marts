import { Switch } from '@owox/ui/components/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { FieldItem, FieldLabel, FieldDescription } from './FormField';

interface EnabledFieldProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export function EnabledField({ enabled, onChange, disabled }: EnabledFieldProps) {
  return (
    <FieldItem>
      <FieldLabel htmlFor='enabled' tooltip='Enable or disable this notification'>
        <div className='flex items-center gap-2'>
          <Switch id='enabled' checked={enabled} onCheckedChange={onChange} disabled={disabled} />
          <span>Enabled</span>
        </div>
      </FieldLabel>
      <FieldDescription>
        <Accordion variant='common' type='single' collapsible>
          <AccordionItem value='how-it-works'>
            <AccordionTrigger>How it works?</AccordionTrigger>
            <AccordionContent>
              When enabled, notifications will be sent to the selected recipients when events occur.
              Email notifications are grouped together based on the grouping delay setting.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </FieldDescription>
    </FieldItem>
  );
}
