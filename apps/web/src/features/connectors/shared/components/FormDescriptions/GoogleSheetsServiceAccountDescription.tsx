import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function GoogleSheetsServiceAccountDescription() {
  return (
    <Accordion variant='common' type='single' collapsible className='text-sm'>
      <AccordionItem value='google-sheets-service-account-details'>
        <AccordionTrigger className='text-sm'>
          How do I get a Service Account JSON key?
        </AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            To get the JSON key, create or use an existing service account in Google Cloud.
          </p>
          <p className='mb-2'>Here&apos;s what to do:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Go to{' '}
              <ExternalAnchor href='https://console.cloud.google.com/iam-admin/serviceaccounts'>
                Google Cloud Console
              </ExternalAnchor>
              .
            </li>
            <li>
              Open <strong>IAM & Admin &gt; Service Accounts</strong>.
            </li>
            <li>Create a new service account or select an existing one.</li>
            <li>
              Open the service account, go to the <strong>Keys</strong> tab, click{' '}
              <strong>Add key</strong>, and select <strong>Create new key</strong>.
            </li>
            <li>
              Choose <strong>JSON</strong> format and click <strong>Create</strong>.
            </li>
            <li>
              Open the downloaded file, copy its entire content, and paste it into the field above.
            </li>
            <li>
              Share the spreadsheet with the service account email from the JSON{' '}
              <code className='bg-muted rounded px-1 py-0.5'>client_email</code> field. Viewer
              access is enough for imports.
            </li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
