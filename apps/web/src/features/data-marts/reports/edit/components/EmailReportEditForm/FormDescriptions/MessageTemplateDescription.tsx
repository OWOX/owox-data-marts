import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with instructions for formatting Markdown.
 */
export default function MessageTemplateDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='message-details'>
        <AccordionTrigger>How can I format my message?</AccordionTrigger>
        <AccordionContent>
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
    </Accordion>
  );
}
