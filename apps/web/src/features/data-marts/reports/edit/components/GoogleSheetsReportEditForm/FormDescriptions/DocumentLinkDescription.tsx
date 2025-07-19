import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with step-by-step instructions for copy and paste document link.
 */
export default function DocumentLinkDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='service-account-details'>
        <AccordionTrigger>How do I get a correct document link?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            To get the correct Google Sheets document URL with a Sheet ID (GID), follow these steps:
          </p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Open your Google Sheets document and select the specific <strong>sheet tab</strong>{' '}
              where the data should be inserted.
            </li>
            <li>
              Share the document with the service account email and grant it <strong>Editor</strong>{' '}
              access.
            </li>
            <li>
              While the correct sheet is selected, copy the URL from your browser's address bar — it
              should include the <code className='text-sm font-semibold'>gid</code> of that sheet.
            </li>
            <li>Paste this URL into the field above.</li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
