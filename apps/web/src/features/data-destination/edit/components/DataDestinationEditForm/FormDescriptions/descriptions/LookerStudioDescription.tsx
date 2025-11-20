import { AccordionItem, AccordionTrigger, AccordionContent } from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function LookerStudioDescription() {
  return (
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
}
