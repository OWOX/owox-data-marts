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
        <AccordionTrigger>What’s connector state?</AccordionTrigger>
        <AccordionContent>
          <p className='mb-2'>
            The connector state stores internal data between runs and updates automatically with
            each execution. It’s used to track progress and ensure consistent data processing across
            runs.
          </p>
          <p className='mb-2'>
            Connector state is available only for connectors that support incremental runs, helping
            add only new or updated records since the last run without reloading existing data.
          </p>
          <p className='mb-2'>
            For more details, see the{' '}
            <ExternalAnchor
              className='underline'
              href='https://docs.owox.com/?utm_source=owox_data_marts&utm_medium=manual_run_sheet&utm_campaign=tooltip_connector_state'
            >
              OWOX documentation
            </ExternalAnchor>
            .
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
