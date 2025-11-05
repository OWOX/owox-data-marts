import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { useForm } from 'react-hook-form';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit';
import { useCallback, useEffect, useId, useState } from 'react';
import { useConnector } from '../../../shared/model/hooks/useConnector';
import { RunType } from '../../../shared/enums/run-type.enum';
import { ConnectorSpecificationAttribute } from '../../../shared/enums/connector-specification-attribute.enum';
import {
  AppForm,
  Form,
  FormActions,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormLayout,
  FormMessage,
  FormRadioGroup,
  FormSection,
} from '@owox/ui/components/form';
import type { ConnectorRunFormData } from '../../../shared/model/types/connector';
import { RequiredType } from '../../../shared/api';
import { AppWizardCollapsible } from '@owox/ui/components/common/wizard';
import ConnectorStateDescription from './FormDescriptions/ConnectorStateDescription';
import { useDataMartContext } from '../../../../data-marts/edit/model';
import { formatDateTime, parseDate } from '../../../../../utils/date-formatters';
import { SecureJsonInput } from '../../../../../shared';

interface ConnectorRunFormProps {
  configuration: ConnectorDefinitionConfig | null;
  onClose?: () => void;
  onSubmit?: (data: ConnectorRunFormData) => void;
}

export function ConnectorRunForm({ configuration, onClose, onSubmit }: ConnectorRunFormProps) {
  const [loadedSpecifications, setLoadedSpecifications] = useState<Set<string>>(new Set());
  const formId = useId();
  const form = useForm<ConnectorRunFormData>({
    defaultValues: {
      runType: RunType.INCREMENTAL,
    },
  });

  const { loading, loadingSpecification, connectorSpecification, fetchConnectorSpecification } =
    useConnector();

  const { dataMart } = useDataMartContext();

  const loadSpecificationSafely = useCallback(
    async (connectorName: string) => {
      if (!loadedSpecifications.has(connectorName) && !loadingSpecification) {
        setLoadedSpecifications(prev => new Set(prev).add(connectorName));
        await fetchConnectorSpecification(connectorName);
      }
    },
    [loadedSpecifications, loadingSpecification, fetchConnectorSpecification]
  );

  useEffect(() => {
    if (configuration?.connector.source.name) {
      void loadSpecificationSafely(configuration.connector.source.name);
    }
  }, [configuration, loading, loadSpecificationSafely]);

  const handleSubmit = (data: ConnectorRunFormData) => {
    if (onSubmit) {
      onSubmit(data);
    }
  };

  const handleCancel = () => {
    if (onClose) {
      onClose();
    }
  };

  const getInputType = (requiredType: RequiredType | undefined) => {
    if (!requiredType) {
      return 'text';
    }
    switch (requiredType) {
      case RequiredType.DATE:
        return 'date';
      case RequiredType.NUMBER:
        return 'number';
      default:
        return 'text';
    }
  };

  if (loadingSpecification) {
    return <div>Loading...</div>;
  }

  if (!connectorSpecification) {
    return <div>No connector specification found</div>;
  }

  return (
    <Form {...form}>
      <AppForm id={formId} noValidate onSubmit={e => void form.handleSubmit(handleSubmit)(e)}>
        <FormLayout>
          <FormSection title='General'>
            <FormField
              control={form.control}
              name='runType'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='Select how you want to load data: incremental updates or full backfill for a period'>
                    Run type
                  </FormLabel>
                  <FormControl>
                    <>
                      <FormRadioGroup
                        options={[
                          { value: RunType.INCREMENTAL, label: 'Incremental load' },
                          { value: RunType.MANUAL_BACKFILL, label: 'Backfill (custom period)' },
                        ]}
                        value={field.value}
                        onChange={field.onChange}
                        orientation='horizontal'
                      />
                      <FormDescription>
                        {form.watch('runType') === RunType.MANUAL_BACKFILL
                          ? 'Reloads all data for a specific time range from the source, replacing existing records for that period. Use when you need to correct or update historical data.'
                          : 'Adds only new or updated records since the last run, using the current state of your Data Mart as a reference. Ideal for keeping data fresh without reloading what`s already there.'}
                      </FormDescription>
                    </>
                  </FormControl>
                </FormItem>
              )}
            />
          </FormSection>

          {form.watch('runType') === RunType.INCREMENTAL && (
            <FormSection>
              <AppWizardCollapsible title='State Info'>
                {(() => {
                  const config = configuration?.connector.source.configuration ?? [];
                  const configIds = config
                    .map((item, idx) => {
                      const rec = item as { _id?: unknown };
                      return typeof rec._id === 'string' ? { id: rec._id, index: idx } : undefined;
                    })
                    .filter((v): v is { id: string; index: number } => Boolean(v));
                  const states = dataMart?.connectorState?.states ?? [];
                  const stateById = new Map(states.map(s => [s._id, s]));
                  const ordered = configIds
                    .map(({ id, index }) => {
                      const st = stateById.get(id);
                      return st ? { state: st, index } : undefined;
                    })
                    .filter((v): v is { state: (typeof states)[number]; index: number } =>
                      Boolean(v)
                    );

                  if (ordered.length === 0) {
                    return (
                      <FormItem>
                        <FormLabel>Connector state</FormLabel>
                        <FormControl>
                          <div className='text-muted-foreground px-3 py-2 text-sm'>
                            No state available
                          </div>
                        </FormControl>
                        <FormDescription>
                          <ConnectorStateDescription />
                        </FormDescription>
                      </FormItem>
                    );
                  }

                  return (
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
                  );
                })()}
              </AppWizardCollapsible>
            </FormSection>
          )}
          {form.watch('runType') === RunType.MANUAL_BACKFILL && (
            <FormSection title='Run configuration'>
              {connectorSpecification
                .filter(field =>
                  field.attributes?.includes(ConnectorSpecificationAttribute.MANUAL_BACKFILL)
                )
                .map(connectorField => (
                  <FormField
                    control={form.control}
                    name={`data.${connectorField.name}`}
                    render={() => (
                      <FormItem key={connectorField.name}>
                        <FormLabel tooltip={connectorField.description}>
                          {connectorField.title ?? connectorField.name}
                        </FormLabel>
                        <FormControl>
                          <Input
                            id={connectorField.name}
                            placeholder={connectorField.description}
                            type={getInputType(connectorField.requiredType)}
                            defaultValue={
                              typeof connectorField.default === 'string' ||
                              typeof connectorField.default === 'number'
                                ? connectorField.default.toString()
                                : undefined
                            }
                            {...form.register(`data.${connectorField.name}`, {
                              required: true,
                            })}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
            </FormSection>
          )}
        </FormLayout>
        <FormActions>
          <Button type='submit' disabled={!form.formState.isValid || loadingSpecification}>
            Run
          </Button>
          <Button type='button' variant='outline' onClick={handleCancel}>
            Cancel
          </Button>
        </FormActions>
      </AppForm>
    </Form>
  );
}
