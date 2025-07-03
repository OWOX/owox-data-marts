import { Skeleton } from '@owox/ui/components/skeleton';
import type { ConnectorFieldsResponseApiDto } from '../../../../../data-storage/shared/api/types/response/connector.response.dto.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info } from 'lucide-react';

interface NodesSelectionStepProps {
  connectorFields: ConnectorFieldsResponseApiDto[] | null;
  selectedField: string;
  connectorName?: string;
  loading?: boolean;
  onFieldSelect: (fieldName: string) => void;
}

export function NodesSelectionStep({
  connectorFields,
  selectedField,
  connectorName,
  loading = false,
  onFieldSelect,
}: NodesSelectionStepProps) {
  const title = connectorName ? `Select Nodes for ${connectorName}` : 'Select Nodes';

  if (loading) {
    return (
      <div className='space-y-4'>
        <h4 className='text-lg font-medium'>{title}</h4>
        <div className='flex flex-col gap-4'>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className='flex items-center space-x-2'>
              <Skeleton className='h-4 w-4 rounded-full' />
              <Skeleton className='h-4 w-32' />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!connectorFields || connectorFields.length === 0) {
    return (
      <div className='space-y-4'>
        <h4 className='text-lg font-medium'>{title}</h4>
        <p className='text-destructive text-sm'>
          {connectorName ? `No nodes found for ${connectorName}` : 'No nodes found'}
        </p>
        <p className='text-muted-foreground text-muted-foreground text-sm'>
          This connector might not be fully implemented yet or there could be other issues. Please
          create an issue on GitHub to report this problem.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <h4 className='text-lg font-medium'>{title}</h4>
      <div className='flex flex-col gap-4'>
        {connectorFields.map(field => (
          <div key={field.name} className='flex items-center space-x-2'>
            <input
              type='radio'
              id={field.name}
              name='selectedField'
              value={field.name}
              className='text-primary focus:ring-primary border-border h-4 w-4'
              onChange={e => {
                onFieldSelect(e.target.value);
              }}
              checked={selectedField === field.name}
            />
            <label htmlFor={field.name} className='text-muted-foreground cursor-pointer text-sm'>
              <div className='flex items-center gap-2'>{field.overview ?? field.name}</div>
            </label>
            {field.name && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className='text-muted-foreground/75 inline-block h-4 w-4 cursor-help' />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Table name: {field.name}</p>
                  {field.description && <p>{field.description}</p>}
                  {field.documentation && <p>{field.documentation}</p>}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
