import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with information about Redshift password.
 */
export default function RedshiftPasswordDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-password-details'>
        <AccordionTrigger>Password security</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Enter the password for your Redshift database user. Your password will be stored
            securely and encrypted.
          </p>
          <p className='text-muted-foreground text-sm'>
            <strong>Security tip:</strong> For production environments, consider using IAM Role
            authentication instead of storing passwords.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
