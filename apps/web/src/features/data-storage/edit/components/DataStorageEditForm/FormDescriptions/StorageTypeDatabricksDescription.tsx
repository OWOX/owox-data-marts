import {
  Accordion,
  AccordionItem,
  AccordionContent,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Description for Databricks storage type.
 */
export default function StorageTypeDatabricksDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='databricks-setup'>
        <AccordionTrigger>How do I get started with Databricks?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Databricks is a unified data analytics platform built on Apache Spark. It provides a
            lakehouse architecture that combines the best of data lakes and data warehouses.
          </p>
          <p className='mb-2'>
            To connect OWOX to Databricks, you'll need your workspace URL, SQL warehouse HTTP path,
            and a Personal Access Token for authentication.
          </p>
          <p className='mb-2'>
            Learn more in{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.owox.com/docs/storages/supported-storages/databricks/'
            >
              OWOX Databricks documentation
            </ExternalAnchor>
            .
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
