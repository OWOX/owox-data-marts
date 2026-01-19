import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with information about Databricks catalogs.
 */
export default function DatabricksCatalogDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='databricks-catalog-details'>
        <AccordionTrigger>What is a Databricks catalog?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            In Unity Catalog, a catalog is the first layer of the three-level namespace (catalog,
            schema, table). This field is optional.
          </p>
          <div className='mt-3'>
            <p className='mb-2 font-medium'>When to specify a catalog:</p>
            <ul className='ml-2 list-inside list-disc space-y-2 text-sm'>
              <li>
                If your workspace uses Unity Catalog and you want to set a default catalog for
                connections
              </li>
              <li>If you're working with a specific catalog for your data marts</li>
            </ul>
          </div>
          <div className='mt-3'>
            <p className='mb-2 font-medium'>When to leave empty:</p>
            <ul className='ml-2 list-inside list-disc space-y-2 text-sm'>
              <li>If you want to specify the catalog in your table names explicitly</li>
              <li>If your workspace doesn't use Unity Catalog</li>
              <li>If you work with multiple catalogs and prefer to switch between them</li>
            </ul>
          </div>
          <div className='mt-4'>
            <p className='mb-2 font-medium'>Example:</p>
            <code className='bg-muted rounded px-1 py-0.5'>main</code> or{' '}
            <code className='bg-muted rounded px-1 py-0.5'>production</code>
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
