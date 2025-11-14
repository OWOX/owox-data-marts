import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@owox/ui/components/form';
import { Textarea } from '@owox/ui/components/textarea';
import { type UseFormReturn, type Path, type FieldPathValue } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { type DataDestinationFormData } from '../../../shared';

interface EmailFieldsProps {
  form: UseFormReturn<DataDestinationFormData>;
  emailsFieldTitle?: string;
}

function EmailTextarea({
  field,
  valueAsString,
  form,
}: {
  field: {
    name: string;
    ref: (instance: HTMLTextAreaElement | null) => void;
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
  };
  valueAsString: string;
  form: UseFormReturn<DataDestinationFormData>;
}) {
  const [rawValue, setRawValue] = useState<string>(valueAsString);
  const [isFocused, setIsFocused] = useState(false);

  // Sync local raw value when external form value changes, but avoid clobbering while user is typing
  useEffect(() => {
    if (!isFocused) setRawValue(valueAsString);
  }, [valueAsString, isFocused]);

  const parseEmails = (raw: string) =>
    raw
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(Boolean);

  // Narrow the field name to a valid form path
  const fieldName = 'credentials.to' as Path<DataDestinationFormData>;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextRaw = e.target.value;
    setRawValue(nextRaw);
    // Mark form dirty immediately without normalizing the display value
    const emails = parseEmails(nextRaw);
    form.setValue(
      fieldName,
      emails as unknown as FieldPathValue<DataDestinationFormData, typeof fieldName>,
      { shouldDirty: true, shouldTouch: true }
    );
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(false);
    field.onBlur();
    const emails = parseEmails(e.target.value);
    // Ensure form value is in sync and normalized on blur
    form.setValue(
      fieldName,
      emails as unknown as FieldPathValue<DataDestinationFormData, typeof fieldName>,
      { shouldDirty: true, shouldTouch: true }
    );
    // Normalize display value after blur
    setRawValue(emails.join(', '));
  };

  return (
    <Textarea
      name={field.name}
      ref={field.ref}
      onFocus={handleFocus}
      onBlur={handleBlur}
      value={rawValue}
      onChange={handleChange}
      className='min-h-[150px] font-mono'
      rows={8}
      placeholder='Enter emails separated by comma, semicolon or newline'
    />
  );
}

export function EmailFields({ form, emailsFieldTitle }: EmailFieldsProps) {
  return (
    <FormField
      control={form.control}
      name='credentials.to'
      render={({ field }) => {
        const valueAsString = Array.isArray(field.value) ? field.value.join(', ') : '';

        return (
          <FormItem>
            <div className='flex items-center justify-between'>
              <FormLabel tooltip='Enter emails separated by comma, semicolon or newline'>
                {emailsFieldTitle ?? 'Emails list'}
              </FormLabel>
            </div>
            <FormControl>
              <EmailTextarea field={field} valueAsString={valueAsString} form={form} />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
