import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion about changing Report
 */
export default function ReportChangingDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='report-change-description-details'>
        <AccordionTrigger>How do I change a report?</AccordionTrigger>
        <AccordionContent>
          <p>
            The report cannot be changed after the trigger is created. If you need a different
            report, delete the existing trigger and create a new one with the desired report.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
