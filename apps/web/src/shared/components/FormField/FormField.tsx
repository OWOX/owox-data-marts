import { type ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  id: string;
  children: ReactNode;
  tooltip?: ReactNode;
  error?: string;
  className?: string;
}

export function FormField({ label, id, children, tooltip, error, className = '' }: FormFieldProps) {
  return (
    <div
      className={`border-border flex flex-col gap-1.5 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4 ${className}`}
    >
      <div className='text-foreground flex items-center gap-1.5 text-sm font-medium'>
        <label htmlFor={id}>{label}</label>
        {tooltip}
      </div>
      <div className='grid w-full gap-1'>
        {children}
        {error && (
          <p id={`${id}-error`} className='text-xs text-red-600' role='alert' aria-live='polite'>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
