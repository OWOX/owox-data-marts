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
} from '@owox/ui/components/form';
import { Label } from '@owox/ui/components/label';
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
          <FormSection title='Run configuration'>
            <FormField
              control={form.control}
              name='runType'
              render={({ field }) => (
                <FormItem>
                  <FormLabel tooltip='Select the type of run to perform'>Run type</FormLabel>
                  <FormControl>
                    <div className='flex gap-8'>
                      <div className='flex items-center space-x-2'>
                        <input
                          type='radio'
                          id={RunType.MANUAL_BACKFILL}
                          value={RunType.MANUAL_BACKFILL}
                          checked={form.watch('runType') === RunType.MANUAL_BACKFILL}
                          onChange={field.onChange}
                        />
                        <Label htmlFor={RunType.MANUAL_BACKFILL}>Manual Backfill </Label>
                      </div>
                      <div className='flex items-center space-x-2'>
                        <input
                          type='radio'
                          id={RunType.INCREMENTAL}
                          value={RunType.INCREMENTAL}
                          checked={form.watch('runType') === RunType.INCREMENTAL}
                          onChange={field.onChange}
                        />
                        <Label htmlFor={RunType.INCREMENTAL}>Incremental</Label>
                      </div>
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
          </FormSection>
          <FormSection title='Description'>
            <FormDescription>
              {form.watch('runType') === RunType.MANUAL_BACKFILL
                ? 'Manual Backfill performs a full data load from the source with specified override fields (period, start date, end date, etc.).'
                : 'Incremental performs a load of only new or changed data with current state of the data mart.'}
            </FormDescription>
          </FormSection>
          {form.watch('runType') === RunType.MANUAL_BACKFILL &&
            connectorSpecification
              .filter(field =>
                field.attributes?.includes(ConnectorSpecificationAttribute.MANUAL_BACKFILL)
              )
              .map(connectorField => (
                <FormSection key={connectorField.name}>
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
                </FormSection>
              ))}
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
