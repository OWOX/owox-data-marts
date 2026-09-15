import { useEffect } from 'react';
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

  const { status, options, error, loadedKey, reload } = useConnectorFieldOptions({
    connectorName,
    field: name,
    configuration,
    dependsOn: optionsDependsOn,
  });

  // A value that is not among the freshly loaded options belongs to a previous
  // spreadsheet or a renamed tab; clearing it makes the user pick a valid one
  // instead of failing later at the fields preview.
  useEffect(() => {
    if (status !== 'loaded' || options.length === 0 || currentValue === '') return;
    if (options.some(option => option.value === currentValue)) return;
    onValueChange(name, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, loadedKey]);

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

  return (
    <Combobox
      options={options}
      value={currentValue}
      onValueChange={(value: string) => {
        onValueChange(name, value);
      }}
      placeholder={
        isWaiting
          ? `Fill the fields above to load ${displayName}s`
          : isLoading
            ? `Loading ${displayName}s...`
            : (placeholder ?? `Select ${displayName}`)
      }
      emptyMessage={`No ${displayName}s found`}
      disabled={isWaiting || isLoading}
      ariaLabel={specification.title ?? specification.name}
      className='w-full'
    />
  );
}
