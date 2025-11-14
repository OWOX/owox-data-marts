import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with information about Data Mart Run results.
 */
export default function SendingConditionDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='sending-condition-details'>
        <AccordionTrigger>What are Data Mart Run results?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            A Data Mart Run result is the outcome of processing your Data Mart — for example,
            running an SQL query that retrieves data for your report.
          </p>
          <p>
            Before sending a report, OWOX automatically runs the Data Mart and checks its result.
            Depending on your settings, the report can be sent always, only if the result is not
            empty, or only if it’s empty.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
