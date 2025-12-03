import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with information about Redshift database.
 */
export default function RedshiftDatabaseDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-database-details'>
        <AccordionTrigger>What is the database name?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            The database name is the name of the database you want to connect to within your
            Redshift cluster or workgroup.
          </p>
          <p className='mb-2'>
            Every Redshift cluster/workgroup has at least one database. The default database is
            often named <code className='bg-muted rounded px-1 py-0.5'>dev</code>, but you may have
            created custom databases.
          </p>
          <p className='text-muted-foreground text-sm'>
            This field is required for all authentication methods.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
