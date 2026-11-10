import { Alert, AlertDescription } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { useForm, type Validate } from 'react-hook-form';
import type { ConnectorDefinitionConfig, ConnectorSourceConfig } from '../../../../data-marts/edit';
import { useCallback, useEffect, useId, useState } from 'react';
import { useConnector } from '../../../shared/model/hooks/useConnector';
import { getConnectorInfoByName } from '../../../shared/utils';
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
import type {
  ConnectorRunFormData,
  ConnectorListItem,
} from '../../../shared/model/types/connector';
import { RequiredType } from '../../../shared/api';
import { useDataMartContext } from '../../../../data-marts/edit/model';
import { ConnectorStateSection } from './ConnectorStateSection';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import {
  LARGE_BACKFILL_DAYS,
  MIN_MANUAL_BACKFILL_START_DATE,
  countBackfillDays,
  countBackfillSegments,
  toUtcDayMs,
} from '../../../shared/constants/manual-backfill';

interface ConnectorRunFormProps {
  configuration: ConnectorDefinitionConfig | null;
  onClose?: () => void;
  onSubmit?: (data: ConnectorRunFormData) => void;
}

/** From this many parts a backfill asks for confirmation: each part is a billed run. */
const MIN_CONFIRMED_BACKFILL_SEGMENTS = 2;

/** A node with no date filter loads the whole catalog once, so no period arithmetic applies. */
const DATELESS_NODE_SUMMARY =
  'This node has no date filter: the backfill loads the whole catalog in one run, whatever period you pick.';

type BackfillPeriod =
  | { status: 'incomplete' }
  | { status: 'reversed' }
  | { status: 'startInFuture' }
  | { status: 'startTooEarly' }
  | { status: 'endInFuture' }
  | { status: 'ok'; days: number; parts: number };

/** Single source of truth for the period: the notice and the field validators both read it. */
function readBackfillPeriod(startDate: unknown, endDate: unknown, today: string): BackfillPeriod {
  if (toUtcDayMs(startDate) === undefined || toUtcDayMs(endDate) === undefined) {
    return { status: 'incomplete' };
  }
  if ((startDate as string) > today) return { status: 'startInFuture' };
  if ((startDate as string) < MIN_MANUAL_BACKFILL_START_DATE) return { status: 'startTooEarly' };
  if ((endDate as string) > today) return { status: 'endInFuture' };
  const days = countBackfillDays(startDate, endDate);
  if (days === 0) return { status: 'reversed' };
  return { status: 'ok', days, parts: countBackfillSegments(startDate, endDate) };
}

function getBackfillSummary(period: BackfillPeriod, isDatelessNode: boolean): string {
  if (isDatelessNode && (period.status === 'incomplete' || period.status === 'ok')) {
    return DATELESS_NODE_SUMMARY;
  }
  switch (period.status) {
    case 'incomplete':
      return 'A period that spans several calendar months loads in parts, one month per run. Pick a start and end date to see how many.';
    case 'startInFuture':
      return 'The start date cannot be in the future. Pick a date up to today.';
    case 'startTooEarly':
      return `The start date cannot be earlier than ${MIN_MANUAL_BACKFILL_START_DATE}. Pick a later date.`;
    case 'endInFuture':
      return 'The end date cannot be in the future. Pick a date up to today.';
    case 'reversed':
      return 'The end date must be on or after the start date.';
    case 'ok': {
      const covers = `This backfill covers ${period.days} ${period.days === 1 ? 'day' : 'days'}`;
      if (period.parts <= 1) return `${covers}.`;
      const summary = `${covers}, loaded in ${period.parts} parts, one per calendar month. It counts as ${period.parts} runs.`;
      return period.days > LARGE_BACKFILL_DAYS
        ? `${summary} This can take hours, holds one of the project's concurrent run slots and uses source API quota.`
        : summary;
    }
  }
}

/**
 * Both dates are capped at today. The inputs carry `max`, but the form is `noValidate`, so a
 * typed or pasted out-of-range day only stops here — and the backend clamps EndDate to today
 * regardless, which would make the number of runs the confirmation dialog quotes wrong.
 */
const notInFutureValidation =
  (
    label: string,
    today: string
  ): Validate<ConnectorRunFormData['data'][string], ConnectorRunFormData> =>
  value =>
    toUtcDayMs(value) === undefined ||
    (value as string) <= today ||
    `${label} cannot be in the future`;

function getBackfillDateValidation(
  fieldName: string,
  today: string
):
  | Record<string, Validate<ConnectorRunFormData['data'][string], ConnectorRunFormData>>
  | undefined {
  if (fieldName === 'StartDate') {
    return {
      notInFuture: notInFutureValidation('Start date', today),
      notTooEarly: value =>
        toUtcDayMs(value) === undefined ||
        (value as string) >= MIN_MANUAL_BACKFILL_START_DATE ||
        `Start date cannot be earlier than ${MIN_MANUAL_BACKFILL_START_DATE}`,
    };
  }
  if (fieldName === 'EndDate') {
    return {
      notInFuture: notInFutureValidation('End date', today),
      period: (value, formValues) => {
        const period = readBackfillPeriod(formValues.data.StartDate, value, today);
        if (period.status === 'reversed') return 'End date must be on or after the start date';
        return true;
      },
    };
  }
  return undefined;
}

export function ConnectorRunForm({ configuration, onClose, onSubmit }: ConnectorRunFormProps) {
  const [loadedSpecifications, setLoadedSpecifications] = useState<Set<string>>(new Set());
  const [pendingRun, setPendingRun] = useState<ConnectorRunFormData | null>(null);
  const formId = useId();
  const form = useForm<ConnectorRunFormData>({
    defaultValues: {
      runType: RunType.INCREMENTAL,
    },
  });

  const {
    loading,
    loadingSpecification,
    loadingFields,
    connectorSpecification,
    connectorFields,
    fetchConnectorSpecification,
    fetchConnectorFields,
  } = useConnector();

  const { dataMart } = useDataMartContext();

  const runType = form.watch('runType');
  const today = new Date().toISOString().slice(0, 10);
  // Both dates are required fields, so the notice reports only what the user actually picked.
  const backfillPeriod = readBackfillPeriod(
    form.watch('data.StartDate'),
    form.watch('data.EndDate'),
    today
  );

  const loadSpecificationSafely = useCallback(
    async (source: ConnectorSourceConfig, info: ConnectorListItem | null | undefined) => {
      if (loadedSpecifications.has(source.name) || loadingSpecification) {
        return;
      }
      setLoadedSpecifications(prev => new Set(prev).add(source.name));

      // `info` carries isCustom/id, which is what routes the request to the
      // custom-by-id endpoint. It is resolved once, when the Data Mart definition is
      // mapped, and a transient custom-connector list failure leaves it null. Re-resolve
      // here instead of falling back to a name-only item: that item has no id, so the
      // request would go to the bundled endpoint, 404, and leave the sheet stuck on
      // "No connector specification found" with no way to run the Data Mart manually.
      const connector = info ?? (await getConnectorInfoByName(source.name).catch(() => null));
      if (!connector) {
        return;
      }

      // The run executes the Data Mart's pinned `source.version`, while `info.version`
      // is only the connector's ACTIVE version. The pin wins so the form renders the
      // MANUAL_BACKFILL parameters of the version that will actually run; `undefined`
      // means "follow active", which is exactly what `info.version` holds.
      const pinned = { ...connector, version: source.version ?? connector.version };
      // The node list says whether the Data Mart's node is fetched by date, which decides
      // whether a long period is quoted in parts or runs once as a whole.
      await Promise.all([fetchConnectorSpecification(pinned), fetchConnectorFields(pinned)]);
    },
    [loadedSpecifications, loadingSpecification, fetchConnectorSpecification, fetchConnectorFields]
  );

  useEffect(() => {
    const source = configuration?.connector.source;
    if (source) {
      void loadSpecificationSafely(source, configuration.connector.info);
    }
  }, [configuration, loading, loadSpecificationSafely]);

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

  // The node list decides whether a long period is quoted in parts, so the form waits for it
  // too; otherwise a catalog node would briefly promise runs the backend never makes.
  if (loadingSpecification || loadingFields) {
    return <div>Loading...</div>;
  }

  if (!connectorSpecification) {
    return <div>No connector specification found</div>;
  }

  const backfillFields = connectorSpecification.filter(field =>
    field.attributes?.includes(ConnectorSpecificationAttribute.MANUAL_BACKFILL)
  );
  // A connector with no date fields treats a backfill as a full refresh, so a period notice
  // would describe a period it never reads.
  const hasBackfillPeriod = backfillFields.some(field => field.name === 'StartDate');
  // Known only once the node list has loaded; until then the period is described as dated,
  // which is what the backend assumes for a node it cannot classify.
  const isDatelessNode =
    connectorFields?.find(field => field.name === configuration?.connector.source.node)
      ?.isTimeSeries === false;
  const backfillDays = backfillPeriod.status === 'ok' ? backfillPeriod.days : 0;
  const backfillSegments = backfillPeriod.status === 'ok' ? backfillPeriod.parts : 0;

  const handleSubmit = (data: ConnectorRunFormData) => {
    // Every part of a long backfill is its own billed run, so ask before starting several.
    // A dateless node runs once whatever the period, so there is nothing to confirm.
    if (
      runType === RunType.MANUAL_BACKFILL &&
      hasBackfillPeriod &&
      !isDatelessNode &&
      backfillSegments >= MIN_CONFIRMED_BACKFILL_SEGMENTS
    ) {
      setPendingRun(data);
      return;
    }
    onSubmit?.(data);
  };

  const handleConfirmRun = () => {
    if (pendingRun) onSubmit?.(pendingRun);
    setPendingRun(null);
  };

  return (
    <>
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
                {backfillFields.map(connectorField => (
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
                            min={
                              connectorField.name === 'StartDate'
                                ? MIN_MANUAL_BACKFILL_START_DATE
                                : undefined
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
                {hasBackfillPeriod && (
                  <Alert
                    role='status'
                    variant={
                      backfillPeriod.status === 'ok' || backfillPeriod.status === 'incomplete'
                        ? 'default'
                        : 'destructive'
                    }
                    data-testid='backfill-limit-notice'
                  >
                    <AlertDescription>
                      {getBackfillSummary(backfillPeriod, isDatelessNode)}
                    </AlertDescription>
                  </Alert>
                )}
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
      <ConfirmationDialog
        open={pendingRun !== null}
        onOpenChange={open => {
          if (!open) setPendingRun(null);
        }}
        title='Start backfill?'
        description={`${String(backfillDays)} days, loaded in ${String(backfillSegments)} parts, one per calendar month. It counts as ${String(backfillSegments)} runs: a part counts once any of its accounts loads data.`}
        confirmLabel='Start backfill'
        cancelLabel='Keep editing'
        variant='brand'
        onConfirm={handleConfirmRun}
      />
    </>
  );
}
