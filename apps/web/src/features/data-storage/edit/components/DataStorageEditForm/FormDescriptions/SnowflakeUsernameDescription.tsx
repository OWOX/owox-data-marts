import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';

/**
 * Accordion with step-by-step instructions for Snowflake Username.
 */
export default function SnowflakeUsernameDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='snowflake-username-details'>
        <AccordionTrigger>How do I find my Snowflake username?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Your Snowflake username is the login identifier for your Snowflake account.
          </p>
          <p className='mb-2'>Here's what you need to know:</p>
          <ul className='list-inside list-disc space-y-2 text-sm'>
            <li>
              Use the same username you use to log in to the Snowflake web interface.
            </li>
            <li>
              Snowflake usernames are case-insensitive and are typically in uppercase by default.
            </li>
            <li>
              If you're using SSO (Single Sign-On) for the web interface, you may need to create a separate user account with password authentication for programmatic access.
            </li>
            <li>
              You can view all users in your account by running: SHOW USERS; (requires appropriate privileges)
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
