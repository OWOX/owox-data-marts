import { AccordionItem, AccordionTrigger, AccordionContent } from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export default function ExcelDescription() {
  return (
    <AccordionItem value='excel-details'>
      <AccordionTrigger>How do I connect to Microsoft Excel?</AccordionTrigger>
      <AccordionContent>
        <p className='mb-2'>
          There is nothing to set up here beyond a title. Name it after the workbook or team that
          will use it: this is how you tell your Excel destinations apart in the add-in. You can
          also leave this to the OWOX add-in for Excel: if you have no Excel destination you can
          use, it creates one the first time you build a report from a workbook. If your project has
          more than one, the add-in asks which one to use when you create a report.
        </p>
        <p className='mb-2'>
          Unlike other destinations, it stores no credentials: the add-in reads your data using your
          own OWOX access, and writes it into the worksheet you opened it from.
        </p>
        <p className='mb-2'>
          For installation steps, including the ones for an organization where the Microsoft
          Marketplace store is turned off, read the{' '}
          <ExternalAnchor
            className='underline'
            href='https://docs.owox.com/docs/destinations/supported-destinations/microsoft-excel/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=tooltip-excel'
          >
            OWOX documentation
          </ExternalAnchor>
          .
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}
