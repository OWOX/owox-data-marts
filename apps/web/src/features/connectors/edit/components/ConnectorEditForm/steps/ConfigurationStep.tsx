import { Label } from '@owox/ui/components/label';
import { Input } from '@owox/ui/components/input';
import { Textarea } from '@owox/ui/components/textarea';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Combobox } from '../../../../../../shared/components/Combobox/combobox.tsx';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../data-storage/shared/api/types/response/connector.response.dto.ts';
import { useState, useEffect, useRef } from 'react';

interface ConfigurationStepProps {
  connectorSpecification: ConnectorSpecificationResponseApiDto[] | null;
  onConfigurationChange?: (configuration: Record<string, unknown>) => void;
  initialConfiguration?: Record<string, unknown>;
  loading?: boolean;
}

function renderInputForType(
  specification: ConnectorSpecificationResponseApiDto,
  configuration: Record<string, unknown>,
  onValueChange: (name: string, value: unknown) => void
) {
  const { name, title, requiredType, options, placeholder, default: defaultValue } = specification;

  const displayName = title ?? name;
  const inputId = name;

  // If options are provided, render a select/combobox
  if (options && options.length > 0) {
    const comboboxOptions = options.map((option: string) => ({
      value: option,
      label: option,
    }));

    return (
      <Combobox
        options={comboboxOptions}
        value={(configuration[name] as string) || (defaultValue as string) || ''}
        onValueChange={(value: string) => {
          onValueChange(name, value);
        }}
        placeholder={placeholder ?? `Select ${displayName.toLowerCase()}`}
        emptyMessage='No options available'
        className='w-full'
      />
    );
  }

  // Render input based on requiredType
  switch (requiredType) {
    case 'boolean':
      return (
        <div className='flex items-center space-x-2'>
          <input
            type='checkbox'
            id={inputId}
            name={name}
            checked={(configuration[name] as boolean) || (defaultValue as boolean) || false}
            onChange={e => {
              onValueChange(name, e.target.checked);
            }}
            className='text-primary focus:ring-primary h-4 w-4 rounded border-gray-300'
          />
          <Label htmlFor={inputId} className='cursor-pointer text-sm'>
            {displayName}
          </Label>
        </div>
      );

    case 'number':
      return (
        <Input
          id={inputId}
          name={name}
          type='number'
          value={(configuration[name] as string) || (defaultValue as string) || ''}
          placeholder={placeholder ?? `Enter ${displayName.toLowerCase()}`}
          onChange={e => {
            const numValue = parseFloat(e.target.value) || 0;
            onValueChange(name, numValue);
          }}
        />
      );

    case 'array':
      return (
        <Textarea
          id={inputId}
          name={name}
          value={
            Array.isArray(configuration[name])
              ? (configuration[name] as string[]).join('\n')
              : Array.isArray(defaultValue)
                ? defaultValue.join('\n')
                : ''
          }
          placeholder={placeholder ?? `Enter ${displayName.toLowerCase()} (one per line)`}
          rows={4}
          onChange={e => {
            const arrayValue = e.target.value.split('\n').filter(line => line.trim());
            onValueChange(name, arrayValue);
          }}
        />
      );

    case 'object':
      return (
        <Textarea
          id={inputId}
          name={name}
          value={
            configuration[name] && typeof configuration[name] === 'object'
              ? JSON.stringify(configuration[name], null, 2)
              : typeof defaultValue === 'object'
                ? JSON.stringify(defaultValue, null, 2)
                : ''
          }
          placeholder={placeholder ?? `Enter ${displayName.toLowerCase()} as JSON`}
          rows={6}
          className='font-mono'
          onChange={e => {
            try {
              const objectValue = JSON.parse(e.target.value) as Record<string, unknown>;
              onValueChange(name, objectValue);
            } catch (error) {
              console.warn(`Invalid JSON for ${name}:`, error);
              // Still update with the string value so user can continue editing
              onValueChange(name, e.target.value);
            }
          }}
        />
      );

    case 'string':
    default:
      return (
        <Input
          id={inputId}
          name={name}
          type='text'
          value={(configuration[name] as string) || (defaultValue as string) || ''}
          placeholder={placeholder ?? `Enter ${displayName.toLowerCase()}`}
          onChange={e => {
            onValueChange(name, e.target.value);
          }}
        />
      );
  }
}

export function ConfigurationStep({
  connectorSpecification,
  onConfigurationChange,
  initialConfiguration,
  loading = false,
}: ConfigurationStepProps) {
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({});
  const initializedRef = useRef(false);
  const updatingFromParentRef = useRef(false);

  // Initialize configuration when component mounts or specification changes
  useEffect(() => {
    if (connectorSpecification) {
      updatingFromParentRef.current = true;
      const config = { ...(initialConfiguration ?? {}) };

      // Add defaults for missing values
      connectorSpecification.forEach(spec => {
        if (config[spec.name] === undefined && spec.default !== undefined) {
          config[spec.name] = spec.default;
        }
      });

      setConfiguration(config);
      initializedRef.current = true;
      // Reset flag after next tick
      setTimeout(() => {
        updatingFromParentRef.current = false;
      }, 0);
    }
  }, [connectorSpecification, initialConfiguration]);

  // Update configuration when initialConfiguration changes (navigation back)
  useEffect(() => {
    if (
      initializedRef.current &&
      initialConfiguration &&
      Object.keys(initialConfiguration).length > 0
    ) {
      updatingFromParentRef.current = true;
      setConfiguration(initialConfiguration);
      // Reset flag after next tick
      setTimeout(() => {
        updatingFromParentRef.current = false;
      }, 0);
    }
  }, [initialConfiguration]);

  // Notify parent when configuration changes (but not when updating from parent)
  useEffect(() => {
    if (
      initializedRef.current &&
      !updatingFromParentRef.current &&
      Object.keys(configuration).length > 0
    ) {
      onConfigurationChange?.(configuration);
    }
  }, [configuration, onConfigurationChange]);

  const handleValueChange = (name: string, value: unknown) => {
    setConfiguration(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  if (loading) {
    return (
      <div className='space-y-2'>
        <h4 className='text-lg font-medium'>Configuration</h4>
        <p className='text-muted-foreground mb-8 text-sm'>Loading connector configuration...</p>
        <div className='flex flex-col gap-4'>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className='mb-2 space-y-1'>
              <Skeleton className='h-4 w-32' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-3 w-48' />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!connectorSpecification || connectorSpecification.length === 0) {
    return null;
  }

  return (
    <div className='space-y-2'>
      <h4 className='text-lg font-medium'>Configuration</h4>
      <p className='text-muted-foreground mb-8 text-sm'>
        Configure the connector parameters. All fields with an asterisk (*) are required.
      </p>
      <div className='flex flex-col gap-4'>
        {connectorSpecification.map(
          specification =>
            // Fields are not shown in the UI. Its a hack to avoid errors before migration to connectors protocol.
            specification.showInUI !== false &&
            specification.name !== 'Fields' && (
              <div key={specification.name} className='mb-2 space-y-1'>
                {specification.requiredType !== 'boolean' && (
                  <Label htmlFor={specification.name} className='text-sm font-medium'>
                    {specification.title ?? specification.name}
                    {specification.required && <span className='ml-1 text-red-500'>*</span>}
                  </Label>
                )}
                {renderInputForType(specification, configuration, handleValueChange)}
                {specification.description && (
                  <p className='text-muted-foreground text-sm'>{specification.description}</p>
                )}
              </div>
            )
        )}
      </div>
    </div>
  );
}
