import { Label } from '@owox/ui/components/label';
import { Input } from '@owox/ui/components/input';
import { Textarea } from '@owox/ui/components/textarea';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Combobox } from '../../../../../../shared/components/Combobox/combobox.tsx';
import type { ConnectorListItem } from '../../../../shared/model/types/connector';
import type { ConnectorSpecificationResponseApiDto } from '../../../../shared/api/types';
import { RawBase64Icon } from '../../../../../../shared/icons';
import { RequiredType } from '../../../../shared/api/types';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@owox/ui/components/button';
import { ExternalLinkIcon, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

interface ConfigurationStepProps {
  connector: ConnectorListItem;
  connectorSpecification: ConnectorSpecificationResponseApiDto[] | null;
  onConfigurationChange?: (configuration: Record<string, unknown>) => void;
  onValidationChange?: (isValid: boolean) => void;
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

  switch (requiredType) {
    case RequiredType.BOOLEAN:
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
            className='text-primary focus:ring-primary border-border h-4 w-4 rounded'
          />
          <Label htmlFor={inputId} className='cursor-pointer text-sm'>
            {displayName}
          </Label>
        </div>
      );

    case RequiredType.NUMBER:
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

    case RequiredType.ARRAY:
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

    case RequiredType.OBJECT:
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
            } catch {
              onValueChange(name, e.target.value);
            }
          }}
        />
      );
    case RequiredType.DATE: {
      const parseDateValue = (value: unknown): string => {
        if (!value) return '';
        if (typeof value !== 'string' && typeof value !== 'number') return '';
        const dateStr = typeof value === 'string' ? value : value.toString();
        try {
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return '';
          return date.toISOString().split('T')[0];
        } catch {
          return '';
        }
      };

      return (
        <Input
          id={inputId}
          name={name}
          type='date'
          value={(configuration[name] as string) || parseDateValue(defaultValue) || ''}
          placeholder={placeholder ?? `Enter ${displayName.toLowerCase()}`}
          onChange={e => {
            onValueChange(name, e.target.value);
          }}
        />
      );
    }

    case RequiredType.STRING:
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
  connector,
  connectorSpecification,
  onConfigurationChange,
  onValidationChange,
  initialConfiguration,
  loading = false,
}: ConfigurationStepProps) {
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({});
  const initializedRef = useRef(false);
  const updatingFromParentRef = useRef(false);

  useEffect(() => {
    if (connectorSpecification) {
      updatingFromParentRef.current = true;
      const config = { ...(initialConfiguration ?? {}) };

      connectorSpecification.forEach(spec => {
        if (config[spec.name] === undefined && spec.default !== undefined) {
          config[spec.name] = spec.default;
        }
      });

      setConfiguration(config);
      initializedRef.current = true;
      setTimeout(() => {
        updatingFromParentRef.current = false;
      }, 0);
    }
  }, [connectorSpecification, initialConfiguration]);

  useEffect(() => {
    if (
      initializedRef.current &&
      initialConfiguration &&
      Object.keys(initialConfiguration).length > 0
    ) {
      updatingFromParentRef.current = true;
      setConfiguration(initialConfiguration);
      setTimeout(() => {
        updatingFromParentRef.current = false;
      }, 0);
    }
  }, [initialConfiguration]);

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

  const validateConfiguration = (
    config: Record<string, unknown>,
    specs: ConnectorSpecificationResponseApiDto[]
  ) => {
    const requiredSpecs = specs.filter(
      spec => spec.required && spec.showInUI !== false && spec.name !== 'Fields'
    );

    return requiredSpecs.every(spec => {
      const value = config[spec.name];

      if (value === null || value === undefined) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;

      return true;
    });
  };

  useEffect(() => {
    if (connectorSpecification && onValidationChange) {
      const isValid = validateConfiguration(configuration, connectorSpecification);
      onValidationChange(isValid);
    }
  }, [configuration, connectorSpecification, onValidationChange]);

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

  // Sort specifications by priority:
  // 1. Required fields without default value
  // 2. Required fields with default value
  // 3. Non-required fields without default value
  // 4. All others (non-required with default value)
  const sortedSpecifications = [...connectorSpecification]
    .filter(spec => spec.showInUI !== false && spec.name !== 'Fields')
    .sort((a, b) => {
      const getPriority = (spec: ConnectorSpecificationResponseApiDto) => {
        const hasDefault = spec.default != null && spec.default !== '';
        if (spec.required && !hasDefault) return 1;
        if (spec.required && hasDefault) return 2;
        if (!spec.required && !hasDefault) return 3;
        return 4;
      };

      return getPriority(a) - getPriority(b);
    });

  return (
    <div className='space-y-4'>
      <div className='mb-2 flex items-center gap-2'>
        {connector.logoBase64 && <RawBase64Icon base64={connector.logoBase64} size={32} />}
        <h4 className='text-lg font-medium'>{connector.displayName} configuration</h4>
      </div>
      {connector.docUrl && (
        <a href={connector.docUrl} target='_blank' rel='noopener noreferrer'>
          <Button variant='link' className='mb-2 cursor-pointer text-sm'>
            View documentation <ExternalLinkIcon className='h-4 w-4' />
          </Button>
        </a>
      )}
      <div className='flex flex-col gap-4'>
        {sortedSpecifications.map(specification => (
          <div key={specification.name} className='mb-2 space-y-1'>
            {specification.requiredType !== RequiredType.BOOLEAN && (
              <Label
                htmlFor={specification.name}
                className='group flex items-center justify-between gap-2 text-sm font-medium'
              >
                <span>
                  {specification.title ?? specification.name}
                  {specification.required && <span className='ml-1 text-red-500'>*</span>}
                </span>
                {specification.description && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type='button'
                        tabIndex={-1}
                        className='opacity-60 transition-opacity hover:opacity-100'
                        aria-label='Help information'
                      >
                        <Info
                          className='text-muted-foreground/50 hover:text-muted-foreground size-4 shrink-0 transition-colors'
                          aria-hidden='true'
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side='top' align='center' role='tooltip'>
                      {specification.description}
                    </TooltipContent>
                  </Tooltip>
                )}
              </Label>
            )}
            {renderInputForType(specification, configuration, handleValueChange)}
          </div>
        ))}
      </div>
    </div>
  );
}
