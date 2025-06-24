import { Skeleton } from '@owox/ui/components/skeleton';
import type { ConnectorFieldsResponseApiDto } from '../../../../../data-storage/shared/api/types/response/connector.response.dto.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info } from 'lucide-react';

interface NodesSelectionStepProps {
  connectorFields: ConnectorFieldsResponseApiDto[] | null;
  selectedField: string;
  loading?: boolean;
  onFieldSelect: (fieldName: string) => void;
}

export function NodesSelectionStep({
  connectorFields,
  selectedField,
  loading = false,
  onFieldSelect,
}: NodesSelectionStepProps) {
  if (loading) {
    return (
      <div className='space-y-4'>
        <h4 className='text-lg font-medium'>Nodes</h4>
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
        <h4 className='text-lg font-medium'>Nodes</h4>
        <p className='text-muted-foreground text-sm'>No nodes found</p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <h4 className='text-lg font-medium'>Nodes</h4>
      <div className='flex flex-col gap-4'>
        {connectorFields.map(field => (
          <div key={field.name} className='flex items-center space-x-2'>
            <input
              type='radio'
              id={field.name}
              name='selectedField'
              value={field.name}
              className='text-primary focus:ring-primary h-4 w-4 border-gray-300'
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
                  <Info className='inline-block h-4 w-4 cursor-help text-gray-500' />
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
