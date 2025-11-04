import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

/**
 * Accordion with an explanation of the Connector State.
 */
export default function ConnectorStateDescription() {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='connector-state-details'>
        <AccordionTrigger>What is the "Connector State"?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            Connector State is a set of <strong>internal variables</strong> that a connector{' '}
            <strong>persists between runs</strong>. This state is updated during execution and used
            in subsequent runs.
          </p>
          <p className='mb-2'>
            For details on connector state variables, see{' '}
            <ExternalAnchor href='https://docs.owox.com'>OWOX Docs</ExternalAnchor>.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
