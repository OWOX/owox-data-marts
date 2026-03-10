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
          <AccordionTrigger>How does Insight Template work?</AccordionTrigger>
          <AccordionContent className='text-muted-foreground'>
            <p>
              Insight templates allow you to use predefined layouts and data visualizations. Select
              a template from the list to use it in your report.
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
            Use the <code>{'{{#data-table}}{{/data-table}}'}</code> tag to render data mart data as
            a table.
          </p>
          <p className='mb-2'>
            Optional parameters:
            <br />
            limit=20 - max rows to display (default: 10, max: 100)
            <br />
            from="end" - show last N rows instead of first
            <br />
            columns="id, revenue" - show only specific columns
          </p>
          <p className='mb-2'>
            Example:
            <br />
            <code>
              {'{{#data-table limit=20 from="end" columns="id, revenue"}}{{/data-table}}'}
            </code>
          </p>
          <p className='mb-2'>
            You can also use <code>{'{{dataHeadersCount}}'}</code> and{' '}
            <code>{'{{dataRowsCount}}'}</code> variables.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
