import { useEffect, useState, useCallback } from 'react';
import { Button } from '@owox/ui/components/button';
import { Box, ChevronRight, PackageSearch } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
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
import type { ConnectorDefinitionConfig, CopiedConfiguration } from '../../../model/types';

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
    try {
      const response = await dataMartService.getDataMartsByConnectorName(currentConnectorName);
      setDataMarts(response);
    } catch {
      setDataMarts([]);
    } finally {
      setLoading(false);
    }
  }, [currentConnectorName]);

  useEffect(() => {
    if (open) {
      void loadDataMarts();
    }
  }, [open, loadDataMarts]);

  const handleSelect = (dataMart: DataMartResponseDto, config: Record<string, unknown>) => {
    const configId = (config as Record<string, unknown> & { _id?: string })._id;

    if (!configId) {
      console.error('Configuration does not have _id field');
      return;
    }

    onCopyConfiguration({
      dataMartId: dataMart.id,
      dataMartTitle: dataMart.title,
      configId,
      configuration: config,
    });
    setOpen(false);
  };

  const getConfigurationPreview = (config: Record<string, unknown>) => {
    const INDENT_SIZE_PX = 12;
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
            style={{ paddingLeft: `${String(indent * INDENT_SIZE_PX)}px` }}
          >
            {key && <span className='font-medium'>{key}:</span>}
            <span className='text-muted-foreground truncate' title={value}>
              {value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button type='button' variant='ghost' size='sm' className='cursor-pointer'>
            <span className='text-muted-foreground/75 text-xs font-semibold tracking-wide uppercase'>
              Copy from&hellip;
            </span>
            <ChevronRight
              className={cn(
                'text-foreground/75 h-3.5 w-3.5 transition-transform duration-200',
                open && 'rotate-90'
              )}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='bottom' align='end' className='w-72'>
          {loading ? (
            <DropdownMenuItem disabled>Loading&hellip;</DropdownMenuItem>
          ) : dataMarts.length === 0 ? (
            <div className='flex flex-col items-center justify-center gap-2 p-4 text-center'>
              <div className='bg-muted/70 rounded-full p-3'>
                <PackageSearch className='text-muted-foreground h-6 w-6' strokeWidth={1.5} />
              </div>
              <span className='text-foreground text-sm font-medium'>
                No matching Data&nbsp;Marts
              </span>
              <span className='text-muted-foreground text-sm'>
                You can reuse configuration settings only from connector-based Data&nbsp;Marts that
                use the same source.
              </span>
            </div>
          ) : (
            <div className='flex flex-col gap-2'>
              <div className='text-muted-foreground border-b p-2 text-sm'>
                Select one of your existing Data&nbsp;Marts to&nbsp;reuse its configuration
                settings.
              </div>
              <div>
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
                              handleSelect(dataMart, configurations[0]);
                            }}
                          >
                            <Box className='text-foreground h-4 w-4' />
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
                      <DropdownMenuSubTrigger className='flex items-center gap-2'>
                        <Box className='text-foreground h-4 w-4' />
                        <span>{dataMart.title}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {configurations.map((config, index) => (
                          <Tooltip key={index} delayDuration={300}>
                            <TooltipTrigger asChild>
                              <DropdownMenuItem
                                onSelect={() => {
                                  handleSelect(dataMart, config);
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
              </div>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
