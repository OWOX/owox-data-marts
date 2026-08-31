import { AccordionItem, AccordionTrigger, AccordionContent } from '@owox/ui/components/accordion';

export default function ExcelDescription() {
  return (
    <AccordionItem value='excel-details'>
      <AccordionTrigger>How do I connect to Microsoft Excel?</AccordionTrigger>
      <AccordionContent>
        <p className='mb-2'>
          There is nothing to set up here. The OWOX add-in for Excel creates this destination for
          you the first time you build a report from a workbook.
        </p>
        <p className='mb-2'>
          Unlike other destinations, it stores no credentials: the add-in reads your data using your
          own OWOX access, and writes it into the worksheet you opened it from.
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}
