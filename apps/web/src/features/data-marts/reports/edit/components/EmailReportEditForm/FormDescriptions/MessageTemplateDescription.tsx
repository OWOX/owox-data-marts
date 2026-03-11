import { TemplateSourceTypeEnum } from '../../../../shared';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export interface MessageTemplateDescriptionProps {
  type: TemplateSourceTypeEnum;
}

/**
 * Accordion with instructions for formatting Markdown or Insight Template.
 */
export default function MessageTemplateDescription({ type }: MessageTemplateDescriptionProps) {
  if (type === TemplateSourceTypeEnum.INSIGHT_TEMPLATE) {
    return (
      <Accordion variant='common' type='single' collapsible>
        <AccordionItem value='insight-template-details' className='border-none'>
          <AccordionTrigger>How does Insight work?</AccordionTrigger>
          <AccordionContent className='text-muted-foreground'>
            <p>
              Insight allow you to use predefined layouts and data visualizations. Select an Insight
              from the list to use it in your report.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  return (
    <Accordion variant='common' type='single' collapsible className='space-y-1'>
      <AccordionItem value='message-details' className='border-none'>
        <AccordionTrigger>How can I format my message?</AccordionTrigger>
        <AccordionContent className='text-muted-foreground'>
          <p className='mb-2'>
            You can format your message using Markdown — a simple text formatting syntax that lets
            you add structure and style without using complex editors.
          </p>
          <p className='mb-2'>
            For example:
            <br />
            **bold text** → <b>bold text</b>
            <br />
            *italic text* → <i>italic text</i>
            <br />- list item → • list item
          </p>
          <p>
            Use the Preview tab to see how your message will look after formatting.
            <br />
            If you’re new to Markdown, learn more from this{' '}
            <ExternalAnchor
              className='underline'
              href='https://www.markdownguide.org/basic-syntax/'
            >
              quick guide
            </ExternalAnchor>
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='data-table-details' className='border-none'>
        <AccordionTrigger>How can I add data into my message?</AccordionTrigger>
        <AccordionContent className='text-muted-foreground'>
          <p className='mb-2'>
            Use the <code>{'{{table}}'}</code> tag to render your data mart results as a table. Type{' '}
            <code>/</code> in the editor to insert it quickly, or paste it manually.
          </p>
          <p className='mb-2'>
            Optional parameters:
            <br />
            <code>limit</code> — max rows to display. Accepts 1 to 100. Default: <code>100</code>.
            Example: <code>limit=20</code>
            <br />
            <code>columns</code> — comma-separated list of columns to show. Example:{' '}
            <code>{'columns="id, revenue"'}</code>
          </p>
          <p className='mb-2'>
            Example:
            <br />
            <code>{'{{table limit=20 columns="id, revenue"}}'}</code>
          </p>
          <p className='mb-2'>
            You can also use <code>{'{{dataHeadersCount}}'}</code> variable to display the total
            number of columns.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
