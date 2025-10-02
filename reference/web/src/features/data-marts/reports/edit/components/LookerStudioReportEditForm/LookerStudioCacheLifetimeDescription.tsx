import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with information about the Looker Studio JSON Config.
 */
export default function LookerStudioCacheLifetimeDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='cache-lifetime-details'>
        <AccordionTrigger>What is the Cache Lifetime for Looker Studio?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Cache Lifetime - defines the period during which results from previous query executions
            are served from storage-side cache, eliminating the need to re-execute the query
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
