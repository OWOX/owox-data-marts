import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about Databricks schemas.
 */
export default function DatabricksSchemaDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='databricks-schema-details'>
        <AccordionTrigger>What is a Databricks schema?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            A schema (also called a database) is the second layer of the three-level namespace
            (catalog, schema, table). This field is optional.
          </p>
          <div className='mt-3'>
            <p className='mb-2 font-medium'>When to specify a schema:</p>
            <ul className='ml-2 list-inside list-disc space-y-2 text-sm'>
              <li>If you want to set a default schema for connections</li>
              <li>If you're working with a specific schema for your data marts</li>
            </ul>
          </div>
          <div className='mt-3'>
            <p className='mb-2 font-medium'>When to leave empty:</p>
            <ul className='ml-2 list-inside list-disc space-y-2 text-sm'>
              <li>If you want to specify the schema in your table names explicitly</li>
              <li>If you work with multiple schemas and prefer to switch between them</li>
            </ul>
          </div>
          <div className='mt-4'>
            <p className='mb-2 font-medium'>Example:</p>
            <code className='bg-muted rounded px-1 py-0.5'>default</code> or{' '}
            <code className='bg-muted rounded px-1 py-0.5'>analytics</code>
          </div>
          <div className='mt-4 text-sm'>
            More details in{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.databricks.com/data-governance/unity-catalog/index.html'
            >
              Databricks Unity Catalog documentation
            </ExternalAnchor>
            .
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
