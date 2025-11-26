import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with step-by-step instructions for Snowflake Private Key Passphrase.
 */
export default function SnowflakePassphraseDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='snowflake-passphrase-details'>
        <AccordionTrigger>What is a passphrase and when do I need it?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            A passphrase is an optional encryption password that protects your private key.
          </p>
          <p className='mb-2'>Here's what you need to know:</p>
          <ul className='list-inside list-disc space-y-2 text-sm'>
            <li>
              If you generated your private key with a passphrase (encrypted key), you must provide
              it here.
            </li>
            <li>
              If your private key is not encrypted (generated without the -nocrypt flag), leave this
              field empty.
            </li>
            <li>
              When generating an encrypted key with OpenSSL, you set the passphrase during the key
              generation process.
            </li>
            <li>
              The passphrase adds an extra layer of security by encrypting the private key file
              itself.
            </li>
            <li>
              This passphrase is only used to decrypt the private key and is never sent to
              Snowflake.
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
