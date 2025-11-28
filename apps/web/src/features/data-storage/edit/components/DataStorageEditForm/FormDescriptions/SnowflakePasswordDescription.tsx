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
        <AccordionTrigger>How do I manage my Snowflake password?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Use the password associated with your Snowflake user account for authentication.
          </p>
          <p className='mb-2'>Important security considerations:</p>
          <ul className='list-inside list-disc space-y-2 text-sm'>
            <li>
              Your password must meet Snowflake's security requirements (minimum length, complexity,
              etc.).
            </li>
            <li>
              If you've forgotten your password, a Snowflake administrator can reset it using: ALTER
              USER username SET PASSWORD = 'new_password';
            </li>
            <li>
              For production environments, consider using{' '}
              <ExternalAnchor
                className='underline'
                href='https://docs.snowflake.com/en/user-guide/key-pair-auth.html'
              >
                Key-Pair authentication
              </ExternalAnchor>{' '}
              instead of passwords for enhanced security.
            </li>
            <li>
              Your password is encrypted and securely stored. It will never be displayed in plain
              text after saving.
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
