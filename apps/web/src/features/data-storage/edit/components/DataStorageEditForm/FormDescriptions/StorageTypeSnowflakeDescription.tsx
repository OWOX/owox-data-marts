import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

const StorageTypeSnowflakeDescription: React.FC = () => {
  return (
    <>
      <Accordion variant='common' type='single' collapsible className='mt-2'>
        <AccordionItem value='snowflake-setup'>
          <AccordionTrigger>How do I get started with Snowflake?</AccordionTrigger>
          <AccordionContent>
            <p className='mb-2'>
              To use Snowflake as your storage provider, you'll need an active Snowflake account with appropriate permissions.
            </p>
            <p className='mb-2'>Here's how to get started:</p>
            <ol className='list-inside list-decimal space-y-2 text-sm'>
              <li>
                Sign up for a{' '}
                <ExternalAnchor className='underline' href='https://signup.snowflake.com/'>
                  Snowflake account
                </ExternalAnchor>{' '}
                if you don't have one yet.
              </li>
              <li>
                Make sure you have the necessary privileges to create and access databases, schemas, and warehouses.
              </li>
              <li>
                Choose your authentication method: Username & Password for quick setup, or Key-Pair authentication for production environments.
              </li>
              <li>
                Fill in the connection details below (account identifier and warehouse).
              </li>
              <li>
                You can access tables using the full path format: database.schema.table (similar to BigQuery and Athena).
              </li>
            </ol>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};

export default StorageTypeSnowflakeDescription;
