import { type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData } from '../../../shared';
import { SENSITIVE_KEYS } from '../../../shared/constants';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@owox/ui/components/form';
import { Info } from 'lucide-react';
import { SecureJsonInput } from '../../../../../shared';

interface GoogleSheetsFieldsProps {
  form: UseFormReturn<DataDestinationFormData>;
}

export function GoogleSheetsFields({ form }: GoogleSheetsFieldsProps) {
  return (
    <div className='space-y-4'>
      <h3 className='text-lg font-medium'>Authentication</h3>
      <FormField
        control={form.control}
        name='credentials.serviceAccount'
        render={({ field }) => (
          <FormItem className='w-full max-w-full'>
            <FormLabel className='flex items-center gap-1'>
              Service Account JSON<span className='text-red-500'>*</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className='h-4 w-4 cursor-help text-gray-500' />
                  </TooltipTrigger>
                  <TooltipContent className='max-w-sm text-sm'>
                    <p>
                      A Service Account Key is a JSON credential file that provides authentication
                      to Google Sheets.
                    </p>
                    <p className='mt-1'>
                      To get one, go to the Google Cloud Console, navigate to IAM & Admin &gt;
                      Service Accounts, create or select a service account, and generate a new JSON
                      key.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </FormLabel>
            <FormControl>
              <div className='w-full max-w-full overflow-hidden'>
                <SecureJsonInput
                  value={field.value}
                  onChange={field.onChange}
                  keysToMask={SENSITIVE_KEYS}
                  className='w-full max-w-full overflow-x-auto break-words whitespace-pre-wrap'
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
