import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with information about Redshift schema.
 */
export default function RedshiftSchemaDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-schema-details'>
        <AccordionTrigger>What is a Redshift schema?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            A schema is a logical container for database objects like tables and views. Redshift
            uses PostgreSQL syntax, and the default schema is{' '}
            <code className='bg-muted rounded px-1 py-0.5'>public</code>.
          </p>
          <p className='text-muted-foreground text-sm'>
            If you leave this field empty, the{' '}
            <code className='bg-muted rounded px-1 py-0.5'>public</code> schema will be used by
            default.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
