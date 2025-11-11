import { type UseFormReturn } from 'react-hook-form';
import { type DataDestinationFormData } from '../../../shared';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '@owox/ui/components/form';
import { Badge } from '@owox/ui/components/badge';
import DestinationTypeDescription from './FormDescriptions/DestinationTypeDescription';
import { DataDestinationTypeModel, DataDestinationStatus } from '../../../shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Link } from 'react-router-dom';
import { ExternalLinkIcon } from 'lucide-react';

interface DestinationTypeFieldProps {
  form: UseFormReturn<DataDestinationFormData>;
  initialData?: DataDestinationFormData;
}

export function DestinationTypeField({ form, initialData }: DestinationTypeFieldProps) {
  return (
    <FormField
      control={form.control}
      name='type'
      render={({ field }) => (
        <FormItem>
          <FormLabel tooltip='Select the destination to send your data'>Destination Type</FormLabel>
          <Select
            onValueChange={field.onChange}
            defaultValue={field.value}
            disabled={!!initialData}
          >
            <FormControl>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select a destination type' />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectGroup>
                {DataDestinationTypeModel.getAllTypes().map(
                  ({ type, displayName, icon: Icon, status }) => {
                    const isComingSoon = status === DataDestinationStatus.COMING_SOON;
                    const isCloudOnly = status === DataDestinationStatus.CLOUD_ONLY;
                    return (
                      <>
                        {isCloudOnly ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <SelectItem key={type} value={type} disabled>
                                  <div className='flex items-center gap-2'>
                                    <Icon size={18} />
                                    {displayName}
                                    <Badge variant='secondary'>Cloud &amp; Enterprise</Badge>
                                  </div>
                                </SelectItem>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side='left' align='start' className='w-[220px]'>
                              Available only in{' '}
                              <Link
                                className='inline-flex items-center gap-1 underline'
                                target='_blank'
                                to='https://docs.owox.com/docs/editions/owox-cloud-editions/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=unavailable_select_item_tooltip'
                              >
                                Cloud edition
                                <ExternalLinkIcon className='h-3 w-3' />
                              </Link>{' '}
                              or with{' '}
                              <Link
                                className='inline-flex items-center gap-1 underline'
                                target='_blank'
                                to='https://docs.owox.com/docs/editions/self-managed-editions/?utm_source=owox_data_marts&utm_medium=destination_entity&utm_campaign=unavailable_select_item_tooltip'
                              >
                                an Enterprise plan
                                <ExternalLinkIcon className='h-3 w-3' />
                              </Link>
                              .
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <SelectItem key={type} value={type} disabled={isComingSoon}>
                            <div className='flex items-center gap-2'>
                              <Icon size={18} />
                              {displayName}
                              {isComingSoon && <Badge variant='outline'>{status}</Badge>}
                            </div>
                          </SelectItem>
                        )}
                      </>
                    );
                  }
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FormDescription>
            <DestinationTypeDescription destinationType={field.value} />
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
