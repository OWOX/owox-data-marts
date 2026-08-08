import { AccordionItem, AccordionTrigger, AccordionContent } from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function GoogleChatDescription() {
  return (
    <AccordionItem value='googlechat-details'>
      <AccordionTrigger>How do I start sending to Google Chat?</AccordionTrigger>
      <AccordionContent>
        <p className='mb-2'>
          Choose <strong>Incoming Webhook</strong> to send the report directly to the space as
          formatted Google Chat messages, or <strong>Channel Email</strong> to send it by email to
          the Chat space address. For webhook delivery, open{' '}
          <strong>Apps &amp; integrations</strong> in the target space, add an incoming webhook, and
          paste its URL here. Treat the URL as a secret.
        </p>
        <p className='mb-2'>
          Then create a report from your Data Mart's <strong>Destinations</strong> tab and configure
          its subject, message, and delivery conditions.
        </p>
        <p className='mb-2'>
          For more details, read the{' '}
          <ExternalAnchor
            className='underline'
            href='https://docs.owox.com/docs/destinations/supported-destinations/google-chat/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=tooltip-google-chat'
          >
            OWOX documentation
          </ExternalAnchor>
          .
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}
