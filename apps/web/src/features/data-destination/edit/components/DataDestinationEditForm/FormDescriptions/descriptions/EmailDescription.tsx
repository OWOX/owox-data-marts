import { AccordionItem, AccordionTrigger, AccordionContent } from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function EmailDescription() {
  return (
    <AccordionItem value='email-details'>
      <AccordionTrigger>How do I start sending Email?</AccordionTrigger>
      <AccordionContent>
        <p className='mb-2'>
          To send reports by email, first configure the <strong>Email</strong> destination in this
          form (add a title and specify recipient addresses). Then, go to your Data Mart page, open
          the <strong>Destinations</strong> tab, and create a report in the Email block.
        </p>
        <p className='mb-2'>
          In the report settings, add a subject and message, and set the delivery conditions. The
          generated report will be delivered by OWOX Data Marts to the selected addresses as
          formatted text.
        </p>
        <p className='mb-2'>
          For more details, read the{' '}
          <ExternalAnchor
            className='underline'
            href='https://docs.owox.com/docs/destinations/supported-destinations/email/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=tooltip-email'
          >
            OWOX documentation
          </ExternalAnchor>
          .
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}
