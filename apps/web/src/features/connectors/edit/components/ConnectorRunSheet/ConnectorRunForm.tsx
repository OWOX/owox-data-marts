import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { useForm } from 'react-hook-form';
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
      await fetchConnectorSpecification({
        ...connector,
        version: source.version ?? connector.version,
      });
    },
    [loadedSpecifications, loadingSpecification, fetchConnectorSpecification]
  );

  useEffect(() => {
    const source = configuration?.connector.source;
    if (source) {
      void loadSpecificationSafely(source, configuration.connector.info);
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

            {form.watch('runType') === RunType.INCREMENTAL && (
              <ConnectorStateSection
                configuration={configuration}
                connectorState={dataMart?.connectorState ?? null}
              />
            )}
          </FormSection>
          {form.watch('runType') === RunType.MANUAL_BACKFILL && (
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
