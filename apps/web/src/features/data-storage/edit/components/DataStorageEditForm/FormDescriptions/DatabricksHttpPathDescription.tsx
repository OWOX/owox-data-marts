import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for finding SQL warehouse HTTP path.
 */
export default function DatabricksHttpPathDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='databricks-httppath-details'>
        <AccordionTrigger>How do I find the SQL warehouse HTTP path?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            The HTTP path identifies which SQL warehouse to use for query execution.
          </p>
          <ol className='list-inside list-decimal space-y-3 text-sm'>
            <li>Sign in to your Databricks workspace.</li>
            <li>
              In the sidebar, click <strong>SQL Warehouses</strong>.
            </li>
            <li>Select the SQL warehouse you want to connect to.</li>
            <li>
              Go to the <strong>Connection Details</strong> tab.
            </li>
            <li>
              Copy the <strong>HTTP Path</strong> value.
            </li>
          </ol>
          <div className='mt-4'>
            <p className='mb-2 font-medium'>Example HTTP path:</p>
            <code className='bg-muted rounded px-1 py-0.5'>
              /sql/1.0/warehouses/abc123def456789
            </code>
          </div>
          <div className='mt-4 text-sm'>
            More details in{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.databricks.com/sql/admin/sql-endpoints.html'
            >
              Databricks SQL Warehouses documentation
            </ExternalAnchor>
            .
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
