import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with information about AWS Secret Access Key.
 */
export default function RedshiftSecretAccessKeyDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='redshift-secret-key-details'>
        <AccordionTrigger>What is an AWS Secret Access Key?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            The Secret Access Key is the private part of your AWS security credentials. It's used
            together with the Access Key ID to sign and authenticate AWS API requests.
          </p>
          <p className='mb-2'>
            Secret Access Keys are typically 40 characters long and are only shown once when
            created. If you lose it, you'll need to create a new access key pair.
          </p>
          <p className='text-muted-foreground text-sm'>
            <strong>Security warning:</strong> Keep your secret access key secure and never share it
            publicly. It will be stored encrypted.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
