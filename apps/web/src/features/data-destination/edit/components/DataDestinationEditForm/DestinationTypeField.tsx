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
                    return (
                      <SelectItem key={type} value={type} disabled={isComingSoon}>
                        <div className='flex items-center gap-2'>
                          <Icon size={18} />
                          {displayName}
                          {isComingSoon && <Badge variant='secondary'>{status}</Badge>}
                        </div>
                      </SelectItem>
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
