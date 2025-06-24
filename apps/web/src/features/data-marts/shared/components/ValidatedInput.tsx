import { useState, useEffect } from 'react';
import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import { z } from 'zod';

export interface ValidatedInputProps<T extends Record<string, string>> {
  id: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  helpText?: string;
  schema: z.ZodSchema<T>;
  fieldName: keyof T & string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  className?: string;
}

export function ValidatedInput<T extends Record<string, string>>({
  id,
  label,
  initialValue = '',
  placeholder = '',
  helpText = '',
  schema,
  fieldName,
  onChange,
  onValidationChange,
  className = '',
}: ValidatedInputProps<T>) {
  const [value, setValue] = useState<string>(initialValue);
  const [isTouched, setIsTouched] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string>(() => {
    const initialData = { [fieldName]: initialValue } as T;
    const result = schema.safeParse(initialData);
    return !result.success ? result.error.errors[0]?.message || 'Invalid format' : '';
  });

  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(!validationError);
    }
  }, [validationError, onValidationChange]);

  const handleChange = (newValue: string) => {
    setValue(newValue);

    if (!isTouched) {
      setIsTouched(true);
    }

    const data = { [fieldName]: newValue } as T;
    const result = schema.safeParse(data);
    const error = !result.success ? result.error.errors[0]?.message || 'Invalid format' : '';
    setValidationError(error);

    if (onValidationChange) {
      onValidationChange(!error);
    }

    onChange(newValue);
  };

  return (
    <div className='space-y-4'>
      <div>
        <Label htmlFor={id} className='block text-sm font-medium text-gray-700'>
          {label}
        </Label>
        <div className='mt-1'>
          <Input
            type='text'
            id={id}
            className={`block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${
              isTouched && validationError ? 'border-red-300' : 'border-gray-300'
            } ${className}`}
            placeholder={placeholder}
            value={value}
            onChange={e => {
              handleChange(e.target.value);
            }}
            onBlur={() => {
              setIsTouched(true);
            }}
          />
        </div>
        {isTouched && validationError && (
          <p className='mt-1 text-sm text-red-600'>{validationError}</p>
        )}
        {helpText && <p className='mt-2 text-sm text-gray-500'>{helpText}</p>}
      </div>
    </div>
  );
}
