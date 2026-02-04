import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with step-by-step instructions for Snowflake Password.
 */
export default function SnowflakePasswordDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='snowflake-password-details'>
        <AccordionTrigger>How do I manage my Snowflake PAT?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Use a Personal Access Token (PAT) from your Snowflake account for authentication.
          </p>
          <p className='mb-2'>Security tips:</p>
          <ul className='list-inside list-disc space-y-2 text-sm'>
            <li>
              To reset your PAT, go to{' '}
              <b>Settings &gt; Authentication &gt; Programmatic access tokens</b> in your Snowflake
              user menu.
            </li>
            <li>
              For production, consider using{' '}
              <ExternalAnchor
                className='underline'
                href='https://docs.snowflake.com/en/user-guide/key-pair-auth.html'
              >
                Key Pair authentication
              </ExternalAnchor>{' '}
              for stronger security.
            </li>
            <li>
              PATs are encrypted and securely stored. They are never shown in plain text after
              saving.
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
