import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with information about the Looker Studio JSON Config.
 */
export default function LookerStudioJsonConfigDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='json-config-details'>
        <AccordionTrigger>What is the JSON Config for Looker Studio?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            The JSON Config contains the necessary credentials and configuration for connecting to
            Looker Studio.
          </p>
          <ul className='list-inside space-y-2 text-sm'>
            <li>You can copy this JSON config to use in Looker Studio Connector.</li>
            <li>
              If you need to rotate a previous secret key, you can use the corresponding function in
              the menu on the destinations list.
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
