import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit';
import { AppWizardCollapsible } from '@owox/ui/components/common/wizard';
import { FormItem, FormLabel, FormControl, FormDescription } from '@owox/ui/components/form';
import ConnectorStateDescription from './FormDescriptions/ConnectorStateDescription';
import { formatDateTime, parseDate } from '../../../../../utils/date-formatters';
import { SecureJsonInput } from '../../../../../shared';
import type { ConnectorStateResponseDto } from '../../../../data-marts/shared/types/api/response/connector-state.response.dto';

interface ConnectorStateSectionProps {
  configuration: ConnectorDefinitionConfig | null;
  connectorState?: ConnectorStateResponseDto | null;
}

export function ConnectorStateSection({
  configuration,
  connectorState,
}: ConnectorStateSectionProps) {
  const config = configuration?.connector.source.configuration ?? [];
  const configIds = config
    .map((item, idx) => {
      const rec = item as { _id?: unknown };
      return typeof rec._id === 'string' ? { id: rec._id, index: idx } : undefined;
    })
    .filter((v): v is { id: string; index: number } => Boolean(v));

  const states = connectorState?.states ?? [];
  const stateById = new Map(states.map(s => [s._id, s] as const));
  const ordered = configIds
    .map(({ id, index }) => {
      const st = stateById.get(id);
      return st ? { state: st, index } : undefined;
    })
    .filter((v): v is { state: (typeof states)[number]; index: number } => Boolean(v));

  return (
    <AppWizardCollapsible title='State Info'>
      {ordered.length === 0 ? (
        <FormItem>
          <FormLabel>Connector state</FormLabel>
          <FormControl>
            <div className='bg-muted min-h-[70px] cursor-not-allowed overflow-auto rounded-md px-3 py-2 font-mono text-sm whitespace-pre-wrap opacity-70'>
              No state available
            </div>
          </FormControl>
          <FormDescription>
            <ConnectorStateDescription />
          </FormDescription>
        </FormItem>
      ) : (
        <>
          {ordered.map(({ state, index }) => {
            const rawCreatedAt = state.at || '';
            const createdAt = rawCreatedAt
              ? formatDateTime(parseDate(rawCreatedAt).toISOString())
              : '—';

            const st = state.state as unknown;
            const jsonString = (() => {
              try {
                return JSON.stringify(st, null, 2);
              } catch {
                return typeof st === 'string' ? st : '"—"';
              }
            })();

            return (
              <FormItem key={state._id}>
                <FormLabel tooltip={`Created at ${createdAt}`}>
                  {`Connector state of configuration #${String(index + 1)}`}
                </FormLabel>
                <FormControl>
                  <SecureJsonInput
                    value={jsonString}
                    displayOnly={true}
                    className='bg-muted overflow-auto rounded-md text-sm'
                    minHeightClass='min-h-0'
                    showCopyButton={true}
                  />
                </FormControl>
                <FormDescription>
                  <ConnectorStateDescription />
                </FormDescription>
              </FormItem>
            );
          })}
        </>
      )}
    </AppWizardCollapsible>
  );
}
