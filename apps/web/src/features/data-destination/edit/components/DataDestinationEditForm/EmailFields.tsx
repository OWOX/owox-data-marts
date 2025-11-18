import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@owox/ui/components/form';
import { Textarea } from '@owox/ui/components/textarea';
import { type UseFormReturn, type Path, type FieldPathValue } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { type DataDestinationFormData } from '../../../shared';

const EMAILS_FIELD_PATH = 'credentials.to' as Path<DataDestinationFormData>;
const EMAIL_SEPARATOR_REGEX = /[,;\n]/; // comma, semicolon, or newline
const EMAILS_JOIN_SEPARATOR = ', ';
const EMAILS_PLACEHOLDER_TEXT = 'Enter emails separated by comma, semicolon or newline';
const DEFAULT_EMAILS_FIELD_TITLE = 'Emails list';

function parseEmails(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(EMAIL_SEPARATOR_REGEX)) {
    const email = part.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }
  return result;
}

function formatEmails(emails: string[]): string {
  return emails.join(EMAILS_JOIN_SEPARATOR);
}

function updateEmailsValue(form: UseFormReturn<DataDestinationFormData>, emails: string[]) {
  form.setValue(
    EMAILS_FIELD_PATH,
    emails as unknown as FieldPathValue<DataDestinationFormData, typeof EMAILS_FIELD_PATH>,
    { shouldDirty: true, shouldTouch: true }
  );
}

function EmailTextarea({
  field,
  form,
}: {
  field: {
    name: string;
    ref: (instance: HTMLTextAreaElement | null) => void;
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
  };
  form: UseFormReturn<DataDestinationFormData>;
}) {
  // Initialize local value from form value
  const initialString = Array.isArray(field.value) ? formatEmails(field.value as string[]) : '';
  const [rawValue, setRawValue] = useState<string>(initialString);
  const [isFocused, setIsFocused] = useState(false);

  // Keep local state in sync with form value when not focused
  const externalValueString = Array.isArray(field.value)
    ? formatEmails(field.value as string[])
    : '';

  useEffect(() => {
    if (!isFocused) setRawValue(externalValueString);
  }, [externalValueString, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextRaw = e.target.value;
    setRawValue(nextRaw);
    updateEmailsValue(form, parseEmails(nextRaw));
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(false);
    field.onBlur();
    const emails = parseEmails(e.target.value);
    updateEmailsValue(form, emails);
    setRawValue(formatEmails(emails)); // normalize display value on blur
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
      placeholder={EMAILS_PLACEHOLDER_TEXT}
    />
  );
}

export function EmailFields({
  form,
  emailsFieldTitle = DEFAULT_EMAILS_FIELD_TITLE, // default param instead of nullish coalescing
}: {
  form: UseFormReturn<DataDestinationFormData>;
  emailsFieldTitle?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={EMAILS_FIELD_PATH}
      render={({ field }) => (
        <FormItem>
          <div className='flex items-center justify-between'>
            <FormLabel tooltip={EMAILS_PLACEHOLDER_TEXT}>{emailsFieldTitle}</FormLabel>
          </div>
          <FormControl>
            <EmailTextarea field={field} form={form} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
