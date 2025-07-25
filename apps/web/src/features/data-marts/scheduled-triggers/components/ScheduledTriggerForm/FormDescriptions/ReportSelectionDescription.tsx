import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion about selecting Report
 */
export default function ReportSelectionDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='report-select-description-details'>
        <AccordionTrigger>How do I choose the report?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            For a Report Run trigger, select one of the available Destinations (e.g., a Google
            Sheets report).
          </p>
          <p>
            You can use an existing one or create a new one on the <strong>Destinations</strong> tab{' '}
            of this Data Mart.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
