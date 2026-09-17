import { Input } from '@owox/ui/components/input';
import { Button } from '@owox/ui/components/button';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';
import { Combobox } from '../../../../../../../../shared/components/Combobox/combobox.tsx';
import { useConnectorFieldOptions } from '../../../../../../shared/model/hooks/useConnectorFieldOptions';

interface ConfigurationDynamicOptionsFieldProps {
  specification: ConnectorSpecificationResponseApiDto;
  configuration: Record<string, unknown>;
  onValueChange: (name: string, value: unknown) => void;
  connectorName: string;
}

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
}: ConfigurationDynamicOptionsFieldProps) {
  const { name, placeholder, optionsDependsOn } = specification;
  const displayName = (specification.title ?? specification.name).toLowerCase();
  const rawValue = configuration[name];
  const currentValue = typeof rawValue === 'string' ? rawValue : '';

  const { status, options, error, reload } = useConnectorFieldOptions({
    connectorName,
    field: name,
    configuration,
    dependsOn: optionsDependsOn,
  });

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
        <div role='alert' className='text-destructive flex items-center gap-2 text-sm'>
          <span className='min-w-0 flex-1'>
            Could not load the list of {displayName}s: {error ?? 'unknown error'}. Enter the value
            manually or retry.
          </span>
          <Button type='button' variant='ghost' size='sm' onClick={reload}>
            Retry
          </Button>
        </div>
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
        <p className='text-muted-foreground text-sm'>No {displayName}s were found.</p>
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

  return (
    <div className='space-y-2'>
      <Combobox
        id={name}
        options={visibleOptions}
        value={currentValue}
        onValueChange={(value: string) => {
          onValueChange(name, value);
        }}
        placeholder={
          isWaiting
            ? `Complete the settings above to load ${displayName}s`
            : isLoading
              ? `Loading ${displayName}s...`
              : (placeholder ?? `Select ${displayName}`)
        }
        emptyMessage={`No ${displayName}s found`}
        disabled={isWaiting || isLoading}
        ariaInvalid={isMissingValue}
        className='w-full'
      />
      {isMissingValue && (
        <p role='alert' className='text-destructive text-sm'>
          &quot;{currentValue}&quot; was not found among the available {displayName}s. Pick another
          one or check the settings above.
        </p>
      )}
    </div>
  );
}
