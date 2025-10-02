'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { cn } from '@owox/ui/lib/utils';
import { Label } from '@owox/ui/components/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info } from 'lucide-react';

/**
 * Form context provider for React Hook Form.
 */
const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

/**
 * FormField wraps react-hook-form Controller and provides field context.
 */
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

/**
 * Custom hook to get field context and state.
 */
const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

/**
 * FormItem with custom styles for field container.
 */
function FormItem({ className = '', ...props }: React.ComponentProps<'div'>) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot='form-item'
        className={cn(
          'group border-border flex flex-col gap-2 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-transparent dark:bg-white/4',
          className
        )}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

/**
 * FormLabel with optional tooltip and custom styles.
 */
interface FormLabelProps extends React.ComponentProps<typeof LabelPrimitive.Root> {
  tooltip?: React.ReactNode | string;
  tooltipProps?: React.ComponentProps<typeof Tooltip>;
}

function FormLabel({ className = '', tooltip, tooltipProps, children, ...props }: FormLabelProps) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot='form-label'
      data-error={!!error}
      className={cn(
        'text-foreground flex items-center justify-between gap-2 text-sm font-medium',
        'data-[error=true]:text-destructive',
        className
      )}
      htmlFor={formItemId}
      {...props}
    >
      <span>{children}</span>
      {tooltip && (
        <Tooltip {...tooltipProps}>
          <TooltipTrigger asChild>
            <button
              type='button'
              tabIndex={-1}
              className='pointer-events-none opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'
              aria-label='Help information'
            >
              <Info
                className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                aria-hidden='true'
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side='top' align='center' role='tooltip'>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </Label>
  );
}

/**
 * FormControl passes ARIA and error props to input elements.
 */
function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <Slot
      data-slot='form-control'
      id={formItemId}
      aria-describedby={!error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
}

/**
 * FormDescription for help text under a field.
 */
function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField();

  return (
    <div
      data-slot='form-description'
      id={formDescriptionId}
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

/**
 * FormMessage for error or validation messages.
 */
function FormMessage({ className, ...props }: React.ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? '') : props.children;

  if (!body) {
    return null;
  }

  return (
    <p
      data-slot='form-message'
      id={formMessageId}
      className={cn('text-destructive text-sm', className)}
      {...props}
    >
      {body}
    </p>
  );
}

/**
 * FormLayout — just a layout wrapper for form fields.
 * Does NOT render a <form> tag!
 */
function FormLayout({
  children,
  className = '',
  variant = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'light';
}) {
  const containerClass =
    variant === 'light'
      ? 'flex-1 overflow-y-auto'
      : 'bg-muted dark:bg-sidebar flex-1 overflow-y-auto p-4';

  return (
    <div className={containerClass}>
      <div className={cn('flex min-h-full flex-col gap-4', className)}>{children}</div>
    </div>
  );
}

/**
 * FormActions — standardized container for form action buttons.
 * Place this after FormLayout, outside the form fields block.
 */
function FormActions({
  className = '',
  children,
  variant = 'default',
}: {
  className?: string;
  children: React.ReactNode;
  variant?: 'default' | 'light';
}) {
  const wrapperClass =
    variant === 'light' ? 'flex flex-col gap-1.5 pt-4' : 'flex flex-col gap-1.5 border-t px-4 py-3';

  return <div className={cn(wrapperClass, className)}>{children}</div>;
}

/**
 * Section for grouping form fields with optional title.
 */
function FormSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className='mb-4'>
      {title && (
        <h3 className='text-muted-foreground/75 mb-2 text-xs font-semibold tracking-wide uppercase'>
          {title}
        </h3>
      )}
      <div className='flex flex-col gap-2'>{children}</div>
    </section>
  );
}

/**
 * Individual radio button component
 */

interface FormRadioProps {
  value: string;
  label: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

function FormRadio({
  value,
  label,
  checked,
  onChange,
  disabled = false,
  orientation = 'vertical',
  className = '',
}: FormRadioProps & { orientation?: 'vertical' | 'horizontal' }) {
  const { formItemId } = useFormField();

  return (
    <label
      htmlFor={`${formItemId}-${value}`}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md py-1 pr-4 pl-2 text-sm',
        disabled && 'cursor-not-allowed opacity-50',
        orientation === 'horizontal' ? 'flex-row' : 'flex-col',
        checked ? 'bg-muted border-input border-b' : 'hover:bg-muted border-border bg-transparent',
        className
      )}
    >
      <input
        type='radio'
        id={`${formItemId}-${value}`}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={cn(
          'peer border-input ring-offset-background h-4 w-4 rounded-full border',
          'checked:bg-primary checked:border-primary',
          'focus-visible:ring-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      />
      <span className={cn('peer-disabled:cursor-not-allowed peer-disabled:opacity-50')}>
        {label}
      </span>
    </label>
  );
}

/**
 * Radio group component
 */

interface FormRadioGroupProps {
  options: {
    value: string;
    label: string;
    disabled?: boolean;
  }[];
  value: string;
  onChange: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

function FormRadioGroup({
  options,
  value,
  onChange,
  orientation = 'vertical',
  className = '',
}: FormRadioGroupProps) {
  return (
    <div
      tabIndex={-1}
      className={cn(
        // layout
        orientation === 'horizontal' ? 'flex gap-6' : 'flex flex-col gap-2',
        // wrapper styles
        'border-input rounded-md border bg-transparent px-1 py-1 transition-colors',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        'text-foreground selection:bg-primary selection:text-primary-foreground',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {options.map(option => (
        <FormRadio
          key={option.value}
          value={option.value}
          label={option.label}
          checked={value === option.value}
          onChange={e => onChange(e.target.value)}
          disabled={option.disabled}
          orientation={orientation}
        />
      ))}
    </div>
  );
}

/**
 * AppForm — base wrapper for all forms.
 * Applies standard layout classes to the <form> element.
 * Use this instead of a raw <form> to avoid style duplication.
 *
 * @example
 * <AppForm onSubmit={...}>
 *   <FormLayout>...</FormLayout>
 *   <FormActions>...</FormActions>
 * </AppForm>
 */
export const AppForm = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(
  ({ children, className = '', ...props }, ref) => (
    <form ref={ref} className={cn('flex flex-1 flex-col overflow-hidden', className)} {...props}>
      {children}
    </form>
  )
);
AppForm.displayName = 'AppForm';

// Re-export all form components for unified import
export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  FormLayout,
  FormActions,
  FormSection,
  FormRadioGroup,
  FormRadio,
};
