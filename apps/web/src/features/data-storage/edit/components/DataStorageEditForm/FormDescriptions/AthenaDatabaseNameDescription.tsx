import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for DatabaseName.
 */
export default function AthenaDatabaseNameDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='athena-database-name-details'>
        <AccordionTrigger>How do I find my Athena database name?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Athena organizes data in databases. You need to enter the database name where your
            tables reside.
          </p>
          <p className='mb-2'>Here's how to find your database name:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Open{' '}
              <ExternalAnchor className='underline' href='https://console.aws.amazon.com/athena/'>
                the AWS Athena console
              </ExternalAnchor>
              .
            </li>
            <li>In the query editor, click on the database dropdown on the left side.</li>
            <li>The dropdown shows all available databases in your selected region.</li>
            <li>Select the database you want to use and enter its exact name in the form.</li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
