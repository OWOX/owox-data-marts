import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { DataDestinationType } from '../../../../shared';

// Description components for each destination type
const GoogleSheetsDescription = () => (
  <AccordionItem value='sheets-api-details'>
    <AccordionTrigger>How do I enable the Google Sheets API?</AccordionTrigger>
    <AccordionContent>
      <p className='mb-2'>
        To send data to Google Sheets, you need to enable the{' '}
        <ExternalAnchor href='https://console.cloud.google.com/apis/library/sheets.googleapis.com'>
          Google Sheets API
        </ExternalAnchor>{' '}
        in your Google Cloud project.
      </p>
      <p className='mb-2'>Here's how to do it:</p>
      <ol className='list-inside list-decimal space-y-2 text-sm'>
        <li>Open the link above and make sure the correct project is selected.</li>
        <li>
          If the API isn't enabled yet, click <strong>Enable</strong>.
        </li>
        <li>If it's already enabled, you'll see the API dashboard — that's fine.</li>
      </ol>
    </AccordionContent>
  </AccordionItem>
);

const LookerStudioDescription = () => (
  <AccordionItem value='looker-studio-details'>
    <AccordionTrigger>How do I connect to Looker Studio?</AccordionTrigger>
    <AccordionContent>
      <p className='mb-2'>
        To send data to Looker Studio, you need to provide a deployment URL that the{' '}
        <ExternalAnchor
          className='p-0'
          href='https://datastudio.google.com/datasources/create?connectorId=AKfycbz6kcYn3qGuG0jVNFjcDnkXvVDiz4hewKdAFjOm-_d4VkKVcBidPjqZO991AvGL3FtM4A'
        >
          Looker Studio connector
        </ExternalAnchor>{' '}
        will use to access your data.
      </p>
      <p className='mb-2'>
        Make sure the deployment URL is accessible from the internet and properly secured.
      </p>
      <ExternalAnchor
        className='p-0'
        href='https://docs.owox.com/docs/destinations/supported-destinations/looker-studio/?utm_source=owox_data_marts&utm_medium=destination_enity&utm_campaign=tooltip'
      >
        Learn more
      </ExternalAnchor>
    </AccordionContent>
  </AccordionItem>
);

const ODataDescription = () => (
  <AccordionItem value='odata-details'>
    <AccordionTrigger>How do I use OData?</AccordionTrigger>
    <AccordionContent>
      <p className='mb-2'>
        OData (Open Data Protocol) is an ISO/IEC approved, OASIS standard that defines a set of best
        practices for building and consuming RESTful APIs.
      </p>
      <p className='mb-2'>This feature is coming soon.</p>
    </AccordionContent>
  </AccordionItem>
);

const EmailDescription = () => (
  <AccordionItem value='email-details'>
    <AccordionTrigger>How do I start sending Email?</AccordionTrigger>
    <AccordionContent>
      <p className='mb-2'>
        To send reports by email, first configure the <strong>Email</strong> destination in this
        form. Then, go to your Data Mart page, open the <strong>Destinations</strong> tab, and
        create a report in the Email block.
      </p>
      <p className='mb-2'>
        In the report settings, specify recipient addresses, add a message, and define delivery
        conditions. The generated report will be delivered by OWOX Data Marts to the selected
        addresses as formatted text.
      </p>
      <p className='mb-2 text-sm'>Make sure recipients have permission to view the report data.</p>
      <p className='mb-2'>
        For more details, read the{' '}
        <ExternalAnchor
          className='underline'
          href='https://docs.owox.com/docs/destinations/supported-destinations/email/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=tooltip'
        >
          OWOX documentation
        </ExternalAnchor>
        .
      </p>
    </AccordionContent>
  </AccordionItem>
);

const SlackDescription = () => (
  <AccordionItem value='slack-details'>
    <AccordionTrigger>How do I start sending to Slack?</AccordionTrigger>
    <AccordionContent>
      <p className='mb-2'>
        To send reports to Slack, first configure the <strong>Slack</strong> destination in this
        form. Then, go to your Data Mart page, open the <strong>Destinations</strong> tab, and
        create a report in the Slack block.
      </p>
      <p className='mb-2'>
        In the report settings, choose the workspace, channel, message text, and define delivery
        conditions. The generated report will be delivered by OWOX Data Marts to the selected
        channel as a message.
      </p>
      <p className='mb-2 text-sm'>
        Make sure OWOX has permission to post messages in the chosen channel.
      </p>
      <p className='mb-2'>
        For more details, read the{' '}
        <ExternalAnchor
          className='underline'
          href='https://docs.owox.com/docs/destinations/supported-destinations/slack/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=tooltip'
        >
          OWOX documentation
        </ExternalAnchor>
        .
      </p>
    </AccordionContent>
  </AccordionItem>
);

const MicrosoftTeamsDescription = () => (
  <AccordionItem value='msteams-details'>
    <AccordionTrigger>How do I start sending to Microsoft Teams?</AccordionTrigger>
    <AccordionContent>
      <p className='mb-2'>
        To send reports to Microsoft Teams, first configure the <strong>Microsoft Teams</strong>{' '}
        destination in this form. Then, go to your Data Mart page, open the{' '}
        <strong>Destinations</strong> tab, and create a report in the Microsoft Teams block.
      </p>
      <p className='mb-2'>
        In the report settings, select the channel, add a message, and define delivery conditions.
        The generated report will be delivered by OWOX Data Marts to the selected channel as a
        message.
      </p>
      <p className='mb-2 text-sm'>
        Make sure OWOX has permission to post messages in your Teams workspace.
      </p>
      <p className='mb-2'>
        For more details, read the{' '}
        <ExternalAnchor
          className='underline'
          href='https://docs.owox.com/docs/destinations/supported-destinations/microsoft-teams/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=tooltip'
        >
          OWOX documentation
        </ExternalAnchor>
        .
      </p>
    </AccordionContent>
  </AccordionItem>
);

const GoogleChatDescription = () => (
  <AccordionItem value='googlechat-details'>
    <AccordionTrigger>How do I start sending to Google Chat?</AccordionTrigger>
    <AccordionContent>
      <p className='mb-2'>
        To send reports to Google Chat, first configure the <strong>Google Chat</strong> destination
        in this form. Then, go to your Data Mart page, open the <strong>Destinations</strong> tab,
        and create a report in the Google Chat block.
      </p>
      <p className='mb-2'>
        In the report settings, add a webhook URL from your Chat space, specify the message text,
        The generated report will be delivered by OWOX Data Marts to the connected space as chat
        messages.
      </p>
      <p className='mb-2 text-sm'>
        Make sure the webhook is active and has permission to receive messages from OWOX.
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

// Map of destination types to their description components
const destinationDescriptions = {
  [DataDestinationType.GOOGLE_SHEETS]: GoogleSheetsDescription,
  [DataDestinationType.LOOKER_STUDIO]: LookerStudioDescription,
  [DataDestinationType.ODATA]: ODataDescription,
  [DataDestinationType.EMAIL]: EmailDescription,
  [DataDestinationType.SLACK]: SlackDescription,
  [DataDestinationType.MS_TEAMS]: MicrosoftTeamsDescription,
  [DataDestinationType.GOOGLE_CHAT]: GoogleChatDescription,
};

interface DestinationTypeDescriptionProps {
  destinationType: DataDestinationType;
}

/**
 * Renders a description component based on the provided destination type.
 *
 * @param {Object} props - The properties object.
 * @param {string} props.destinationType - The type of destination whose description component will be rendered.
 * @return {JSX.Element} The Accordion component containing the dynamically selected description component.
 */
export default function DestinationTypeDescription({
  destinationType,
}: DestinationTypeDescriptionProps) {
  const DescriptionComponent = destinationDescriptions[destinationType];

  return (
    <Accordion variant='common' type='single' collapsible>
      <DescriptionComponent />
    </Accordion>
  );
}
