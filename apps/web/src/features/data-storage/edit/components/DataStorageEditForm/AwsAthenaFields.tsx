import { Input } from '@owox/ui/components/input';
import { DataStorageType } from '../../../shared';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormSection,
  FormDescription,
} from '@owox/ui/components/form';
import type { UseFormReturn } from 'react-hook-form';
import AthenaRegionDescription from './FormDescriptions/AthenaRegionDescription.tsx';
import AthenaOutputBucketDescription from './FormDescriptions/AthenaOutputBucketDescription.tsx';

interface AwsAthenaFieldsProps {
  form: UseFormReturn<DataStorageFormData>;
}

export const AwsAthenaFields = ({ form }: AwsAthenaFieldsProps) => {
  if (form.watch('type') !== DataStorageType.AWS_ATHENA) {
    return null;
  }
  return (
    <FormSection title='Connection Settings'>
      <FormField
        control={form.control}
        name='config.region'
        render={({ field }) => (
          <FormItem>
            <FormLabel tooltip='Enter the AWS region where your Athena service is active'>
              Region
            </FormLabel>
            <FormControl>
              <Input {...field} placeholder='Enter a region' />
            </FormControl>
            <FormDescription>
              <AthenaRegionDescription />
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='config.outputBucket'
        render={({ field }) => (
          <FormItem>
            <FormLabel tooltip='Specify the S3 bucket where Athena query results will be stored'>
              Output Bucket
            </FormLabel>
            <FormControl>
              <Input {...field} placeholder='Enter an output bucket' />
            </FormControl>
            <FormDescription>
              <AthenaOutputBucketDescription />
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormSection>
  );
};
