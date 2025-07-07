import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DataDestinationType } from '../../../shared';
import { DataDestinationStatus } from '../../../shared';
import { Button } from '@owox/ui/components/button';
import { GoogleSheetsFields } from './GoogleSheetsFields';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@owox/ui/components/form';
import { DataDestinationTypeModel } from '../../../shared';
import { type DataDestinationFormData, dataDestinationSchema } from '../../../shared';
import { Input } from '@owox/ui/components/input';
import { Separator } from '@owox/ui/components/separator';
import { Badge } from '@owox/ui/components/badge';

interface DataDestinationFormProps {
  initialData?: DataDestinationFormData;
  onSubmit: (data: DataDestinationFormData) => Promise<void>;
  onCancel: () => void;
}

export function DataDestinationForm({ initialData, onSubmit, onCancel }: DataDestinationFormProps) {
  const form = useForm<DataDestinationFormData>({
    resolver: zodResolver(dataDestinationSchema),
    defaultValues: initialData ?? {
      title: '',
      type: DataDestinationType.GOOGLE_SHEETS,
      credentials: {
        serviceAccount: '',
      },
    },
    mode: 'onTouched',
  });

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void form.handleSubmit(onSubmit)(e);
  };

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className='space-y-6'>
        <div className='space-y-4'>
          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Title<span className='text-red-500'>*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder='Enter title' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='type'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Destination Type<span className='text-red-500'>*</span>
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={!!initialData}
                >
                  <FormControl>
                    <SelectTrigger className={'w-full'}>
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
                                <Icon />
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
                <FormMessage />
              </FormItem>
            )}
          />
          <Separator />
          <GoogleSheetsFields form={form} />
        </div>

        <div className='flex justify-end space-x-4'>
          <Button variant={'ghost'} type='button' onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={'default'} type='submit'>
            Save
          </Button>
        </div>
      </form>
    </Form>
  );
}
