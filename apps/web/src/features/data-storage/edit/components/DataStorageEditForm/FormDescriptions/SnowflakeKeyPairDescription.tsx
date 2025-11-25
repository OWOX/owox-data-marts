import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for Snowflake Key Pair setup.
 */
export default function SnowflakeKeyPairDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='snowflake-keypair-details'>
        <AccordionTrigger>How do I set up key pair authentication?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            To use key pair authentication, you need to generate an RSA key pair and configure your Snowflake user.
          </p>
          <p className='mb-2'>Here's how to set it up:</p>
          <ol className='list-inside list-decimal space-y-2 text-sm'>
            <li>
              Generate an RSA key pair using OpenSSL:
              <pre className='mt-1 rounded bg-gray-100 p-2 text-xs dark:bg-gray-800'>
                openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
              </pre>
            </li>
            <li>
              Extract the public key:
              <pre className='mt-1 rounded bg-gray-100 p-2 text-xs dark:bg-gray-800'>
                openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
              </pre>
            </li>
            <li>
              Assign the public key to your Snowflake user (run this in Snowflake as ACCOUNTADMIN):
              <pre className='mt-1 rounded bg-gray-100 p-2 text-xs dark:bg-gray-800'>
                ALTER USER your_username SET RSA_PUBLIC_KEY='MIIBIjANBg...';
              </pre>
            </li>
            <li>
              Copy the private key content from rsa_key.p8 and paste it in the Private Key field above.
            </li>
          </ol>
          <p className='mt-2 text-xs'>
            For more details, see{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.snowflake.com/en/user-guide/key-pair-auth.html'
            >
              Snowflake's key pair authentication documentation
            </ExternalAnchor>
            .
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
