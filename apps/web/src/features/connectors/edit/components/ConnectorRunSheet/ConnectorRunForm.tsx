import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { useForm } from 'react-hook-form';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit/model';
import { useCallback, useEffect, useId, useState } from 'react';
import { useConnector } from '../../../shared/model/hooks/useConnector';
import { RunType } from '../../../shared/enums/run-type.enum';
import { ConnectorSpecificationAttribute } from '../../../shared/enums/connector-specification-attribute.enum';
import {
  Form,
  AppForm,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormLayout,
  FormActions,
  FormSection,
  FormDescription,
  FormRadioGroup,
} from '@owox/ui/components/form';
import type { ConnectorRunFormData } from '../../../shared/model/types/connector';
import { RequiredType } from '../../../shared/api/types/types';

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
      runType: RunType.MANUAL_BACKFILL,
    },
  });

  const { loading, loadingSpecification, connectorSpecification, fetchConnectorSpecification } =
    useConnector();

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
                  <FormLabel tooltip='Select how you want to load data: full backfill for a period or incremental updates'>
                    Run type
                  </FormLabel>
                  <FormControl>
                    <>
                      <FormRadioGroup
                        options={[
                          { value: RunType.MANUAL_BACKFILL, label: 'Backfill (custom period)' },
                          { value: RunType.INCREMENTAL, label: 'Incremental load' },
                        ]}
                        value={field.value}
                        onChange={field.onChange}
                        orientation='horizontal'
                      />
                      <FormDescription>
                        {form.watch('runType') === RunType.MANUAL_BACKFILL
                          ? 'Performs a full data load from the source for the selected period using override fields (such as start date, end date, etc.). Use this option to update historical data or reload a specific time range.'
                          : 'Loads only new or changed data based on the current state of the Data Mart. Use this option to keep your Data Mart up to date without reloading existing data.'}
                      </FormDescription>
                    </>
                  </FormControl>
                </FormItem>
              )}
            />
          </FormSection>
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
