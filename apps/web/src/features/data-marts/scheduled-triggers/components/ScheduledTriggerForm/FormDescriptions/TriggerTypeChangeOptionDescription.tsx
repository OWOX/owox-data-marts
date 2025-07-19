import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion about trigger type changing
 */
export default function TriggerTypeChangeOptionDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='trigger-type-change-description-details'>
        <AccordionTrigger>How do I change the trigger type?</AccordionTrigger>
        <AccordionContent>
          <p>
            Trigger type cannot be changed after the trigger is created. If you need a different
            type, delete the existing trigger and create a new one with the desired type.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
