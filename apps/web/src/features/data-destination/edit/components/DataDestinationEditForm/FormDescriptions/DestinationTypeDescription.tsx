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
        </ExternalAnchor>{' '}will use to access your data.
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

// Map of destination types to their description components
const destinationDescriptions = {
  [DataDestinationType.GOOGLE_SHEETS]: GoogleSheetsDescription,
  [DataDestinationType.LOOKER_STUDIO]: LookerStudioDescription,
  [DataDestinationType.ODATA]: ODataDescription,
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
