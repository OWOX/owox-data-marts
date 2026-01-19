import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for finding Databricks workspace URL.
 */
export default function DatabricksHostDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='databricks-host-details'>
        <AccordionTrigger>How do I find my Databricks workspace URL?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>Your Databricks workspace URL is the hostname of your workspace.</p>
          <ol className='list-inside list-decimal space-y-3 text-sm'>
            <li>Sign in to your Databricks workspace.</li>
            <li>
              Look at the URL in your browser's address bar. The hostname is everything before the
              first slash.
            </li>
            <li>
              For example, if your workspace URL is{' '}
              <code className='bg-muted rounded px-1 py-0.5'>
                https://adb-123456789.7.azuredatabricks.net/?o=123456789
              </code>
              , then your host is{' '}
              <code className='bg-muted rounded px-1 py-0.5'>
                adb-123456789.7.azuredatabricks.net
              </code>
            </li>
          </ol>
          <div className='mt-4'>
            <p className='mb-2 font-medium'>Examples by cloud provider:</p>
            <ul className='ml-4 space-y-1'>
              <li>
                AWS:{' '}
                <code className='bg-muted rounded px-1 py-0.5'>
                  dbc-12345678-90ab.cloud.databricks.com
                </code>
              </li>
              <li>
                Azure:{' '}
                <code className='bg-muted rounded px-1 py-0.5'>
                  adb-123456789.7.azuredatabricks.net
                </code>
              </li>
              <li>
                GCP:{' '}
                <code className='bg-muted rounded px-1 py-0.5'>
                  12345678901234.5.gcp.databricks.com
                </code>
              </li>
            </ul>
          </div>
          <div className='mt-4 text-sm'>
            More details in{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.databricks.com/workspace/workspace-details.html'
            >
              Databricks documentation
            </ExternalAnchor>
            .
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
