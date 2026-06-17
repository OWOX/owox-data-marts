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
import { ChevronRight, CircleAlert, Info } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@owox/ui/components/collapsible';

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

type FormSectionContextValue = {
  registerFieldName: (name: string) => void;
};

const FormSectionContext = React.createContext<FormSectionContextValue | null>(null);

/**
 * FormField wraps react-hook-form Controller and provides field context.
 * It also reports its field name to the enclosing FormSection so the section
 * can track validation errors of its fields even while collapsed.
 */
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  const sectionContext = React.useContext(FormSectionContext);
  const { name } = props;

  React.useEffect(() => {
    sectionContext?.registerFieldName(name);
  }, [sectionContext, name]);

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
interface FormItemProps extends React.ComponentProps<'div'> {
  variant?: 'default' | 'light';
}

function FormItem({ className = '', variant = 'default', ...props }: FormItemProps) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot='form-item'
        className={cn(
          variant === 'default' &&
            'group border-border flex flex-col gap-2 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-transparent dark:bg-white/4',
          variant === 'light' && 'flex flex-col gap-1.5',
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
  variant?: 'default' | 'light' | 'inline';
}) {
  const wrapperClass =
    variant === 'inline'
      ? 'flex items-center justify-between gap-2 border-t px-4 py-3'
      : variant === 'light'
        ? 'flex flex-col gap-1.5 pt-4'
        : 'flex flex-col gap-1.5 border-t px-4 py-3';

  return <div className={cn(wrapperClass, className)}>{children}</div>;
}

/**
 * Section for grouping form fields with optional title.
 */
interface FormSectionProps {
  title?: string;
  description?: string;
  tooltip?: React.ReactNode | string;
  titleAdornment?: React.ReactNode;
  /**
   * Right-aligned slot rendered in the section header, OUTSIDE the collapsible
   * trigger. Use this for buttons that should not toggle the section (search,
   * add, etc.). Rendered next to the optional tooltip icon.
   */
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  name?: string;
  /**
   * Form field names whose validation errors belong to this section.
   * FormFields rendered inside the section register themselves automatically;
   * pass this only for sections that may start collapsed, since their fields
   * never mount and cannot self-register.
   */
  fields?: string[];
}

const SECTION_STORAGE_PREFIX = 'form-section-';

function FormSectionTooltip({ tooltip }: { tooltip: React.ReactNode | string }) {
  return (
    <Tooltip>
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
  );
}

/**
 * Subscribes to the validation state of the given fields and reports it to
 * the enclosing FormSection. Rendered as a separate component so FormSection
 * itself works outside a react-hook-form context.
 */
function FormSectionErrorObserver({
  fields,
  onErrorStateChange,
}: {
  fields: string[];
  onErrorStateChange: (hasError: boolean, submitCount: number) => void;
}) {
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fields });
  const hasError = fields.some(field => getFieldState(field, formState).invalid);
  const { submitCount } = formState;

  React.useEffect(() => {
    onErrorStateChange(hasError, submitCount);
  }, [hasError, submitCount, onErrorStateChange]);

  return null;
}

function FormSection({
  title,
  description,
  tooltip,
  titleAdornment,
  actions,
  children,
  defaultOpen = true,
  collapsible = true,
  name,
  fields,
}: FormSectionProps) {
  const getInitialState = () => {
    if (name) {
      try {
        const stored = localStorage.getItem(`${SECTION_STORAGE_PREFIX}${name}`);
        if (stored !== null) return stored === 'true';
      } catch {
        /* ignore */
      }
    }
    return defaultOpen;
  };

  const [isOpen, setIsOpen] = React.useState(getInitialState);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (name) {
        try {
          localStorage.setItem(`${SECTION_STORAGE_PREFIX}${name}`, String(open));
        } catch {
          /* ignore */
        }
      }
    },
    [name]
  );

  // null outside a react-hook-form context — error tracking is disabled there
  const formContext = useFormContext() as ReturnType<typeof useFormContext> | null;

  // Names are sticky: a field that mounted at least once keeps counting toward
  // the section's error state even after the section collapses and unmounts it.
  const [registeredFieldNames, setRegisteredFieldNames] = React.useState<string[]>([]);
  const registerFieldName = React.useCallback((fieldName: string) => {
    setRegisteredFieldNames(prev => (prev.includes(fieldName) ? prev : [...prev, fieldName]));
  }, []);
  const sectionContextValue = React.useMemo(() => ({ registerFieldName }), [registerFieldName]);

  const watchedFields = React.useMemo(() => {
    const merged = [...(fields ?? []), ...registeredFieldNames];
    return [...new Set(merged)];
  }, [fields, registeredFieldNames]);

  const [hasError, setHasError] = React.useState(false);
  const handledSubmitCount = React.useRef(0);
  const handleErrorStateChange = React.useCallback((nextHasError: boolean, submitCount: number) => {
    setHasError(nextHasError);
    if (nextHasError && submitCount > handledSubmitCount.current) {
      handledSubmitCount.current = submitCount;
      // Open directly (not via handleOpenChange) so the auto-open does not
      // overwrite the user's persisted open/closed preference in localStorage.
      setIsOpen(true);
    }
  }, []);

  const errorObserver = formContext && watchedFields.length > 0 && (
    <FormSectionErrorObserver fields={watchedFields} onErrorStateChange={handleErrorStateChange} />
  );

  const content = (
    <FormSectionContext.Provider value={sectionContextValue}>
      <div className='flex flex-col gap-2'>{children}</div>
    </FormSectionContext.Provider>
  );

  // Non-collapsible section
  if (!collapsible) {
    return (
      <div data-slot='form-section' className='flex flex-col gap-2'>
        {title && (
          <div className='group flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <h3 className='text-muted-foreground/75 text-xs font-semibold tracking-wide uppercase'>
                {title}
              </h3>
              {titleAdornment}
            </div>
            {(actions || tooltip) && (
              <div className='flex items-center gap-1'>
                {actions}
                {tooltip && <FormSectionTooltip tooltip={tooltip} />}
              </div>
            )}
          </div>
        )}
        {description && <p className='text-muted-foreground mt-2 mb-2 text-sm'>{description}</p>}
        {content}
      </div>
    );
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleOpenChange}
      data-slot='form-section'
      className='flex flex-col gap-2'
    >
      {errorObserver}
      {title && (
        <div className='group flex items-center justify-between'>
          <CollapsibleTrigger asChild>
            <button
              type='button'
              className={cn('flex cursor-pointer items-center', titleAdornment ? 'gap-2' : 'gap-1')}
            >
              <span className='text-muted-foreground/75 text-xs font-semibold tracking-wide uppercase'>
                {title}
              </span>
              {titleAdornment}
              {hasError && (
                <>
                  <CircleAlert
                    data-testid='form-section-error-indicator'
                    // -mt-px optically centers the icon against the uppercase
                    // title: caps sit slightly above the line-box center.
                    className='text-destructive -mt-px size-3.5 shrink-0'
                    aria-hidden='true'
                  />
                  <span className='sr-only'>This section contains validation errors</span>
                </>
              )}
              <ChevronRight
                className={cn(
                  'text-foreground/75 h-3.5 w-3.5 transition-transform duration-200',
                  isOpen && 'rotate-90'
                )}
              />
            </button>
          </CollapsibleTrigger>
          {(actions || tooltip) && (
            <div className='flex items-center gap-1'>
              {actions}
              {tooltip && <FormSectionTooltip tooltip={tooltip} />}
            </div>
          )}
        </div>
      )}

      <CollapsibleContent className='data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden'>
        {description && <p className='text-muted-foreground text-sm'>{description}</p>}
        {content}
      </CollapsibleContent>
    </Collapsible>
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
  value?: string;
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
 * Card-style radio option. Renders a bordered card with a radio input, label,
 * optional description, and optional children slot for extra content.
 */

interface FormRadioCardProps {
  value: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

function FormRadioCard({
  value,
  label,
  description,
  checked,
  onChange,
  disabled = false,
  children,
  className,
  'data-testid': dataTestId,
}: FormRadioCardProps) {
  return (
    <label
      className={cn(
        'border-border flex cursor-pointer items-start gap-3 rounded-md border-b bg-white px-6 py-4 transition-shadow duration-200 select-none hover:shadow-xs dark:border-white/4 dark:bg-white/4 dark:hover:bg-white/8',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <input
        type='radio'
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        disabled={disabled}
        data-testid={dataTestId}
        className={cn(
          'accent-primary mt-1 h-4 w-4 shrink-0',
          'focus-visible:ring-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      />
      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <div className='flex flex-col gap-1'>
          <div className='text-md font-medium'>{label}</div>
          {description && <div className='text-muted-foreground pb-1 text-sm'>{description}</div>}
        </div>
        {children}
      </div>
    </label>
  );
}

/**
 * Grid wrapper for FormRadioCard options.
 * Renders 1 column on mobile, 2 columns on sm+ breakpoint.
 */

interface FormRadioCardGroupProps {
  children: React.ReactNode;
  className?: string;
}

function FormRadioCardGroup({ children, className }: FormRadioCardGroupProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4', className)}>
      {children}
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
  FormRadioCard,
  FormRadioCardGroup,
};
