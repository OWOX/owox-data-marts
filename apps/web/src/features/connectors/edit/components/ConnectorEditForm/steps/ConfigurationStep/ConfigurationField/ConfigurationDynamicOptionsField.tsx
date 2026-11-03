import { useEffect, useId, useRef } from 'react';
import { Input } from '@owox/ui/components/input';
import { Button } from '@owox/ui/components/button';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';
import { Combobox } from '../../../../../../../../shared/components/Combobox/combobox.tsx';
import { useConnectorFieldOptions } from '../../../../../../shared/model/hooks/useConnectorFieldOptions';

/** An extra list item that does something instead of picking a value, e.g. adding a file. */
export interface DynamicOptionsAction {
  label: string;
  onSelect: () => Promise<void> | void;
  disabled?: boolean;
  /** Why the action is disabled. */
  hint?: string;
}

/** What a form adds to its dynamic options fields, keyed by field name. */
export interface DynamicOptionsExtras {
  actions?: Readonly<Record<string, DynamicOptionsAction>>;
  onLabelChange?: (field: string, label: string | undefined) => void;
}

interface ConfigurationDynamicOptionsFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  connectorName: string;
  /** Rendered as the last list item, and as a button when the list fails or is empty. */
  action?: DynamicOptionsAction;
  /** The label of the selected option, undefined when the list does not hold the value. */
  onLabelChange?: (label: string | undefined) => void;
}

const ACTION_VALUE = '__dynamic_options_action__';

const sentence = (text: string) => {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

// Fields whose title is not a noun that takes a plural "s".
const PLURAL_NOUN: Readonly<Record<string, string>> = { SpreadsheetId: 'spreadsheets' };

/**
 * Field whose allowed values come from the source (DYNAMIC_OPTIONS): waits for
 * its dependencies, loads the options, and falls back to free-text input when
 * the options cannot be loaded so the user is never blocked.
 *
 * The stored value is never changed on the user's behalf: it stays visible
 * while the options are loading or unavailable, and a value the source no
 * longer offers is flagged instead of being cleared.
 */
export function ConfigurationDynamicOptionsField({
  specification,
  configuration,
  onValueChange,
  connectorName,
  action,
  onLabelChange,
}: ConfigurationDynamicOptionsFieldProps) {
  const { name, placeholder, optionsDependsOn } = specification;
  const displayName = (specification.title ?? specification.name).toLowerCase();
  const plural = PLURAL_NOUN[name] ?? `${displayName}s`;
  const rawValue = configuration[name];
  const currentValue = typeof rawValue === 'string' ? rawValue : '';

  const { status, options, error, reload } = useConnectorFieldOptions({
    connectorName,
    field: name,
    configuration,
    dependsOn: optionsDependsOn,
  });
  const hintId = useId();

  const settled = status === 'loaded' || status === 'error';
  const selectedLabel = options.find(option => option.value === currentValue)?.label;
  // A ref, so a caller passing a new function each render does not re-report the same label.
  const onLabelChangeRef = useRef(onLabelChange);
  onLabelChangeRef.current = onLabelChange;
  useEffect(() => {
    if (settled) onLabelChangeRef.current?.(selectedLabel);
  }, [settled, selectedLabel]);

  const runAction = async () => {
    if (!action) return;
    await action.onSelect();
    reload();
  };

  const actionButton = action && (
    <Button
      type='button'
      variant='outline'
      size='sm'
      disabled={action.disabled}
      aria-describedby={action.disabled && action.hint ? hintId : undefined}
      onClick={() => void runAction()}
    >
      {action.label}
    </Button>
  );
  const actionHint = action?.disabled && action.hint && (
    <p id={hintId} className='text-muted-foreground text-xs'>
      {action.hint}
    </p>
  );

  if (status === 'error') {
    return (
      <div className='space-y-2'>
        <Input
          id={name}
          name={name}
          type='text'
          value={currentValue}
          placeholder={placeholder ?? `Enter ${displayName}`}
          onChange={event => {
            onValueChange(name, event.target.value);
          }}
        />
        <p role='alert' className='text-destructive text-sm'>
          {`Could not load the list of ${plural}.` + (error ? ` ${sentence(error)}` : '')}
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          <Button type='button' variant='outline' size='sm' onClick={reload}>
            Retry
          </Button>
          {actionButton}
        </div>
        {actionHint}
      </div>
    );
  }

  if (status === 'loaded' && options.length === 0) {
    return (
      <div className='space-y-2'>
        <Input
          id={name}
          name={name}
          type='text'
          value={currentValue}
          placeholder={placeholder ?? `Enter ${displayName}`}
          onChange={event => {
            onValueChange(name, event.target.value);
          }}
        />
        <p className='text-muted-foreground text-sm'>No {plural} were found.</p>
        {actionButton}
        {actionHint}
      </div>
    );
  }

  const isWaiting = status === 'waiting';
  const isLoading = status === 'loading';
  const isKnownValue = options.some(option => option.value === currentValue);
  const isMissingValue = status === 'loaded' && currentValue !== '' && !isKnownValue;
  // Keep the stored value on screen even when the list does not (yet) contain it:
  // the combobox renders its placeholder for a value it has no option for.
  const visibleOptions =
    currentValue !== '' && !isKnownValue
      ? [{ value: currentValue, label: currentValue }, ...options]
      : options;
  const listedOptions = action
    ? [
        ...visibleOptions,
        {
          value: ACTION_VALUE,
          label: action.label,
          forceMount: true,
          separator: options.length > 0,
          disabled: action.disabled,
        },
      ]
    : visibleOptions;

  return (
    <div className='space-y-2'>
      <Combobox
        id={name}
        options={listedOptions}
        value={currentValue}
        onValueChange={(value: string) => {
          if (value === ACTION_VALUE) {
            void runAction();
            return;
          }
          onValueChange(name, value);
        }}
        renderLabel={(option, context) =>
          option.value === ACTION_VALUE && context === 'item' && action?.disabled && action.hint ? (
            <span className='flex min-w-0 flex-1 flex-col'>
              <span>{option.label}</span>
              <span className='text-muted-foreground text-xs'>{action.hint}</span>
            </span>
          ) : (
            // The trigger wraps the label in a flex item, so only a block span truncates there.
            <span className={context === 'trigger' ? 'block truncate' : 'min-w-0 flex-1 truncate'}>
              {option.label}
            </span>
          )
        }
        placeholder={
          isWaiting
            ? `Complete the settings above to load ${plural}`
            : isLoading
              ? `Loading ${plural}...`
              : (placeholder ?? `Select ${displayName}`)
        }
        emptyMessage={`No ${plural} found`}
        disabled={isWaiting || isLoading}
        ariaInvalid={isMissingValue}
        className='w-full'
      />
      {isMissingValue && (
        <p role='alert' className='text-destructive text-sm'>
          &quot;{currentValue}&quot; was not found among the available {plural}. Pick another one or
          check the settings above.
        </p>
      )}
    </div>
  );
}
