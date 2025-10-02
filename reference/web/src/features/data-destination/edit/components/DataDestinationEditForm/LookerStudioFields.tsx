import { type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData, generateLookerStudioJsonConfig } from '../../../shared';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { SecureJsonInput } from '../../../../../shared';
import { useMemo } from 'react';
import { isLookerStudioCredentials } from '../../../shared/model/types/looker-studio-credentials.ts';
import LookerStudioJsonConfigDescription from './FormDescriptions/LookerStudioJsonConfigDescription';

interface LookerStudioFieldsProps {
  form: UseFormReturn<DataDestinationFormData>;
}

export function LookerStudioFields({ form }: LookerStudioFieldsProps) {
  const credentials = form.getValues('credentials');

  const lookerStudioCredentials = useMemo(() => {
    if (isLookerStudioCredentials(credentials)) {
      return credentials;
    }
    return { deploymentUrl: '', destinationId: '', destinationSecretKey: '' };
  }, [credentials]);

  const jsonConfig = useMemo(() => {
    return generateLookerStudioJsonConfig(lookerStudioCredentials);
  }, [lookerStudioCredentials]);

  return (
    <>
      <FormField
        control={form.control}
        name='credentials.deploymentUrl'
        render={({ field }) => (
          <FormItem className='w-full'>
            <FormLabel tooltip='Enter the deployment URL that the Looker Studio connector will use'>
              Deployment URL
            </FormLabel>
            <FormControl>
              <Input placeholder='https://example.com' {...field} value={field.value || ''} />
            </FormControl>
            <FormDescription>
              The deployment URL that the Looker Studio connector will use to access your data
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      {lookerStudioCredentials.destinationSecretKey && (
        <FormField
          control={form.control}
          name='credentials.destinationSecretKey'
          render={() => (
            <FormItem>
              <FormLabel>JSON Config</FormLabel>
              <FormControl>
                <SecureJsonInput
                  value={jsonConfig}
                  displayOnly={true}
                  keysToMask={['destinationSecretKey']}
                  className='bg-muted overflow-auto rounded-md text-sm'
                  showCopyButton={true}
                />
              </FormControl>
              <FormMessage />
              <FormDescription>
                <LookerStudioJsonConfigDescription />
              </FormDescription>
            </FormItem>
          )}
        ></FormField>
      )}
    </>
  );
}
