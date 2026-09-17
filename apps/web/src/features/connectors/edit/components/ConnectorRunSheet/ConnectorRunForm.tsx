import { Alert, AlertDescription } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { useForm, type Validate } from 'react-hook-form';
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
import { useDataMartContext } from '../../../../data-marts/edit/model';
import { ConnectorStateSection } from './ConnectorStateSection';
import {
  BACKFILL_END_DATE_FIELD,
  BACKFILL_START_DATE_FIELD,
  MAX_MANUAL_BACKFILL_DAYS,
  countBackfillDays,
  countBackfillRuns,
  todayIsoDay,
  toUtcDayMs,
} from '../../../shared/constants/manual-backfill';

interface ConnectorRunFormProps {
  configuration: ConnectorDefinitionConfig | null;
  onClose?: () => void;
  onSubmit?: (data: ConnectorRunFormData) => void;
}

type BackfillFieldValue = ConnectorRunFormData['data'][string];
type BackfillDateValidation = Record<string, Validate<BackfillFieldValue, ConnectorRunFormData>>;

const BACKFILL_LIMIT_NOTICE = `Each backfill run covers at most ${MAX_MANUAL_BACKFILL_DAYS} days. Longer periods run as sequential runs of up to ${MAX_MANUAL_BACKFILL_DAYS} days, one at a time.`;

function getBackfillSummary(days: number): string {
  if (days === 0) {
    return `${BACKFILL_LIMIT_NOTICE} Pick a start and end date to see how many runs your period needs.`;
  }
  const runs = countBackfillRuns(days);
  if (runs === 1) {
    return `This backfill covers ${days} ${days === 1 ? 'day' : 'days'} and runs as one run.`;
  }
  return `This backfill covers ${days} days and will run as ${runs} sequential runs of up to ${MAX_MANUAL_BACKFILL_DAYS} days, one at a time. Each run appears in Run History as Backfill 1/${runs}, 2/${runs}, and so on. A failed run does not stop the remaining runs; cancelling a run does.`;
}

function getBackfillDateValidation(
  fieldName: string,
  today: string
): BackfillDateValidation | undefined {
  if (fieldName === BACKFILL_START_DATE_FIELD) {
    return {
      notInFuture: value =>
        toUtcDayMs(value) === undefined ||
        (value as string) <= today ||
        'Start date cannot be in the future',
    };
  }
  if (fieldName === BACKFILL_END_DATE_FIELD) {
    return {
      notBeforeStart: (value, formValues) => {
        const startDate = formValues.data[BACKFILL_START_DATE_FIELD];
        if (toUtcDayMs(value) === undefined || toUtcDayMs(startDate) === undefined) return true;
        return (
          countBackfillDays(startDate, value) > 0 || 'End date must be on or after the start date'
        );
      },
    };
  }
  return undefined;
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

  const runType = form.watch('runType');
  const startDate = form.watch(`data.${BACKFILL_START_DATE_FIELD}`);
  const endDate = form.watch(`data.${BACKFILL_END_DATE_FIELD}`);
  const today = todayIsoDay();
  // The backend defaults a missing EndDate to today, so the preview does the same.
  const effectiveEndDate = endDate === undefined || endDate === '' ? today : endDate;
  const backfillDays = countBackfillDays(startDate, effectiveEndDate);

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
                        {runType === RunType.MANUAL_BACKFILL
                          ? 'Reloads all data for a specific time range from the source, replacing existing records for that period. Use when you need to correct or update historical data.'
                          : 'Adds only new or updated records since the last run, using the current state of your Data Mart as a reference. Ideal for keeping data fresh without reloading what`s already there.'}
                      </FormDescription>
                    </>
                  </FormControl>
                </FormItem>
              )}
            />

            {runType === RunType.INCREMENTAL && (
              <ConnectorStateSection
                configuration={configuration}
                connectorState={dataMart?.connectorState ?? null}
              />
            )}
          </FormSection>
          {runType === RunType.MANUAL_BACKFILL && (
            <FormSection title='Run configuration'>
              {connectorSpecification
                .filter(field =>
                  field.attributes?.includes(ConnectorSpecificationAttribute.MANUAL_BACKFILL)
                )
                .map(connectorField => (
                  <FormField
                    key={connectorField.name}
                    control={form.control}
                    name={`data.${connectorField.name}`}
                    render={() => (
                      <FormItem>
                        <FormLabel tooltip={connectorField.description}>
                          {connectorField.title ?? connectorField.name}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={connectorField.description}
                            type={getInputType(connectorField.requiredType)}
                            max={
                              connectorField.requiredType === RequiredType.DATE ? today : undefined
                            }
                            defaultValue={
                              typeof connectorField.default === 'string' ||
                              typeof connectorField.default === 'number'
                                ? connectorField.default.toString()
                                : undefined
                            }
                            {...form.register(`data.${connectorField.name}`, {
                              required: true,
                              validate: getBackfillDateValidation(connectorField.name, today),
                            })}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              <Alert data-testid='backfill-limit-notice'>
                <AlertDescription>{getBackfillSummary(backfillDays)}</AlertDescription>
              </Alert>
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
