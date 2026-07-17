import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with a brief explanation of the available BigQuery authentication methods.
 */
export default function GoogleBigQueryAuthMethodDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='bigquery-auth-method-details'>
        <AccordionTrigger>Which authentication method should I choose?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>BigQuery supports two authentication methods:</p>
          <div className='space-y-3 text-sm'>
            <div>
              <strong className='font-medium'>Connect with Google (OAuth):</strong>
              <p className='mt-1'>
                The quickest way to get started. Sign in with your Google account and grant access
                to BigQuery in a few clicks. Best for most users.
              </p>
            </div>
            <div>
              <strong className='font-medium'>Service Account JSON:</strong>
              <p className='mt-1'>
                Uses a Google Cloud service account key for server-to-server authentication.
                Recommended when you need unattended access without a personal Google account, or
                when your organization requires service accounts for compliance.
              </p>
            </div>
          </div>
          <p className='mt-3 text-sm'>
            Whichever method you choose, the account (personal or service account) needs the{' '}
            <strong>BigQuery Data Editor</strong> (<code>roles/bigquery.dataEditor</code>) and{' '}
            <strong>BigQuery Job User</strong> (<code>roles/bigquery.jobUser</code>) roles on the
            target Google Cloud project.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
