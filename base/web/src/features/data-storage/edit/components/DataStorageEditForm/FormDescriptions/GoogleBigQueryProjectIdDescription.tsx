import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for obtaining a Google Service Account JSON key.
 */
export default function GoogleBigQueryProjectIdDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='project-id-details'>
        <AccordionTrigger>How do I find my Project ID?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            This is the ID of your Google Cloud project. BigQuery usage costs will be charged to
            this project.
          </p>
          <p className='mb-2'>Here's how to find your billing project ID:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Open{' '}
              <ExternalAnchor className='underline' href='https://console.cloud.google.com/'>
                Google Cloud Console
              </ExternalAnchor>{' '}
              and sign in with your Google account.
            </li>
            <li>
              Click the project selector dropdown at the top of the page (it shows the current
              project name or "Select a project").
            </li>
            <li>
              Find your project in the list. The <strong>Project ID</strong> is shown in the ID
              column.
            </li>
            <li>If you don't see your project, use the search box to find it by name or ID.</li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
