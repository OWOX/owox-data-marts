import { useEffect, useState, useCallback } from 'react';
import { Button } from '@owox/ui/components/button';
import { TextCursorInput } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { dataMartService } from '../../../../shared';
import type { DataMartResponseDto } from '../../../../shared/types/api';
import type { ConnectorDefinitionConfig } from '../../../model/types/connector-definition-config';

export interface CopiedConfiguration {
  dataMartId: string;
  dataMartTitle: string;
  configIndex: number;
  configuration: Record<string, unknown>;
}

interface CopyConfigurationButtonProps {
  currentConnectorName: string;
  onCopyConfiguration: (config: CopiedConfiguration) => void;
  connectorSpecification?: { name: string; required?: boolean }[];
}

export function CopyConfigurationButton({
  currentConnectorName,
  onCopyConfiguration,
  connectorSpecification,
}: CopyConfigurationButtonProps) {
  const [dataMarts, setDataMarts] = useState<DataMartResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadDataMarts = useCallback(async () => {
    setLoading(true);
    const response = await dataMartService.getDataMartsByConnectorName(currentConnectorName);
    setDataMarts(response);
    setLoading(false);
  }, [currentConnectorName]);

  useEffect(() => {
    if (open) {
      void loadDataMarts();
    }
  }, [open, loadDataMarts]);

  const handleSelect = (dataMart: DataMartResponseDto, configIndex: number) => {
    const definition = dataMart.definition as ConnectorDefinitionConfig;
    const configuration = definition.connector.source.configuration[configIndex];

    onCopyConfiguration({
      dataMartId: dataMart.id,
      dataMartTitle: dataMart.title,
      configIndex,
      configuration,
    });
    setOpen(false);
  };

  const getConfigurationPreview = (config: Record<string, unknown>) => {
    const configFields: { key: string; value: string; indent: number }[] = [];

    const isRequiredField = (fieldName: string): boolean => {
      if (!connectorSpecification) return true;
      const spec = connectorSpecification.find(s => s.name === fieldName);
      return spec?.required ?? false;
    };

    const processValue = (key: string, value: unknown, indent = 0, checkRequired = true) => {
      if (key.startsWith('_') || (checkRequired && indent === 0 && !isRequiredField(key))) {
        return;
      }

      let displayValue: string | null = null;

      if (value === null || value === undefined) {
        displayValue = 'N/A';
      } else if (typeof value === 'string') {
        displayValue = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        displayValue = String(value);
      } else if (Array.isArray(value)) {
        displayValue = JSON.stringify(value);
      } else if (typeof value === 'object') {
        configFields.push({ key, value: '{', indent });
        Object.entries(value as Record<string, unknown>).forEach(([nestedKey, nestedValue]) => {
          processValue(nestedKey, nestedValue, indent + 1, false);
        });
        configFields.push({ key: '', value: '}', indent });
        return;
      } else {
        displayValue = JSON.stringify(value);
      }

      configFields.push({ key, value: displayValue, indent });
    };

    for (const [key, value] of Object.entries(config)) {
      processValue(key, value);
    }

    return (
      <div className='space-y-1 font-mono text-xs'>
        {configFields.map(({ key, value, indent }, index) => (
          <div
            key={index}
            className='flex gap-2'
            style={{ paddingLeft: `${String(indent * 12)}px` }}
          >
            {key && <span className='font-medium'>{key}:</span>}
            <span className='text-muted-foreground truncate'>{value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button type='button' variant='ghost' size='sm'>
            <TextCursorInput className='h-4 w-4' />
            Use settings from...
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-64'>
          {loading ? (
            <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
          ) : dataMarts.length === 0 ? (
            <DropdownMenuItem disabled>
              No Data Marts with this connector definition found
            </DropdownMenuItem>
          ) : (
            <>
              <div className='p-2 text-sm font-bold'>
                Select Data Mart to copy configuration settings from:{' '}
              </div>
              {dataMarts.map(dataMart => {
                const definition = dataMart.definition as ConnectorDefinitionConfig;
                const configurations = definition.connector.source.configuration;

                if (configurations.length === 0) return null;

                if (configurations.length === 1) {
                  return (
                    <Tooltip key={dataMart.id} delayDuration={300}>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          onSelect={() => {
                            handleSelect(dataMart, 0);
                          }}
                        >
                          {dataMart.title}
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side='right' className='max-w-sm'>
                        {getConfigurationPreview(configurations[0])}
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return (
                  <DropdownMenuSub key={dataMart.id}>
                    <DropdownMenuSubTrigger>
                      <span>{dataMart.title}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {configurations.map((config, index) => (
                        <Tooltip key={index} delayDuration={300}>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              onSelect={() => {
                                handleSelect(dataMart, index);
                              }}
                            >
                              Configuration {index + 1}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side='right' className='max-w-sm'>
                            {getConfigurationPreview(config)}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
