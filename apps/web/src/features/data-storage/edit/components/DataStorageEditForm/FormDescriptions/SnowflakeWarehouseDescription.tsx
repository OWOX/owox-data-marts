import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with step-by-step instructions for Snowflake Warehouse.
 */
export default function SnowflakeWarehouseDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='snowflake-warehouse-details'>
        <AccordionTrigger>How do I find my Snowflake warehouse?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            A warehouse in Snowflake is a cluster of compute resources that executes queries and performs data loading operations.
          </p>
          <p className='mb-2'>Here's how to find your warehouse:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Log in to your Snowflake account and navigate to the "Warehouses" section in the left sidebar.
            </li>
            <li>
              You'll see a list of available warehouses. Common default names include "COMPUTE_WH" or "PROD_WH".
            </li>
            <li>
              Select the warehouse you want to use for this connection. Make sure it has the appropriate size and auto-suspend settings for your workload.
            </li>
            <li>
              If you don't have a warehouse, you can create one using the "Create Warehouse" button or run: CREATE WAREHOUSE my_warehouse;
            </li>
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
