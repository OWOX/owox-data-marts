import { AccordionItem, AccordionTrigger, AccordionContent } from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function SlackDescription() {
  return (
    <AccordionItem value='slack-details'>
      <AccordionTrigger>How do I start sending to Slack?</AccordionTrigger>
      <AccordionContent>
        <p className='mb-2'>
          To send reports to Slack, first configure the <strong>Slack</strong> destination in this
          form (add a title and specify recipient addresses). Then, go to your Data Mart page, open
          the <strong>Destinations</strong> tab, and create a report in the Slack block.
        </p>
        <p className='mb-2'>
          In the report settings, add a subject and message, and set the delivery conditions. The
          generated report will be delivered by OWOX Data Marts to the selected channel as a
          message.
        </p>
        <p className='mb-2'>
          For more details, read the{' '}
          <ExternalAnchor
            className='underline'
            href='https://docs.owox.com/docs/destinations/supported-destinations/slack/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=tooltip-slack'
          >
            OWOX documentation
          </ExternalAnchor>
          .
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}
