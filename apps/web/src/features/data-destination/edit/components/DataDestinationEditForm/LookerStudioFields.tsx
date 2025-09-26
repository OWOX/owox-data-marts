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
    if (credentials && isLookerStudioCredentials(credentials)) {
      return credentials;
    }
    return { deploymentUrl: '', destinationId: '', destinationSecretKey: '' };
  }, [credentials]);

  const jsonConfig = useMemo(() => {
    return generateLookerStudioJsonConfig(lookerStudioCredentials);
  }, [lookerStudioCredentials]);

  return (
    <>
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
