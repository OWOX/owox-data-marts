import { AccordionItem, AccordionTrigger, AccordionContent } from '@owox/ui/components/accordion';

export default function ODataDescription() {
  return (
    <AccordionItem value='odata-details'>
      <AccordionTrigger>How do I use OData?</AccordionTrigger>
      <AccordionContent>
        <p className='mb-2'>
          OData (Open Data Protocol) is an ISO/IEC approved, OASIS standard that defines a set of
          best practices for building and consuming RESTful APIs.
        </p>
        <p className='mb-2'>This feature is coming soon.</p>
      </AccordionContent>
    </AccordionItem>
  );
}
