import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with information about Redshift username.
 */
export default function RedshiftUsernameDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-username-details'>
        <AccordionTrigger>How do I find my Redshift username?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            The username is the database user account you want to use for connecting to Redshift.
          </p>
          <p className='mb-2'>
            Common default usernames include{' '}
            <code className='bg-muted rounded px-1 py-0.5'>awsuser</code> or{' '}
            <code className='bg-muted rounded px-1 py-0.5'>admin</code>, but your administrator may
            have created custom users.
          </p>
          <p className='text-muted-foreground text-sm'>
            Contact your Redshift administrator if you don't know your username.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
