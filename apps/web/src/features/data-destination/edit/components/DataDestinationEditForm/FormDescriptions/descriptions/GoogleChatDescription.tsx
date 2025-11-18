import { AccordionItem, AccordionTrigger, AccordionContent } from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function GoogleChatDescription() {
  return (
    <AccordionItem value='googlechat-details'>
      <AccordionTrigger>How do I start sending to Google Chat?</AccordionTrigger>
      <AccordionContent>
        <p className='mb-2'>
          To send reports to Google Chat, first configure the <strong>Google Chat</strong>{' '}
          destination in this form. Then, go to your Data Mart page, open the{' '}
          <strong>Destinations</strong> tab, and create a report in the Google Chat block.
        </p>
        <p className='mb-2'>
          In the report settings, select the channel, add a message, and define delivery conditions.
          The generated report will be delivered by OWOX Data Marts to the connected space as chat
          messages.
        </p>
        <p className='mb-2'>
          For more details, read the{' '}
          <ExternalAnchor
            className='underline'
            href='https://docs.owox.com/docs/destinations/supported-destinations/google-chat/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=tooltip'
          >
            OWOX documentation
          </ExternalAnchor>
          .
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}
