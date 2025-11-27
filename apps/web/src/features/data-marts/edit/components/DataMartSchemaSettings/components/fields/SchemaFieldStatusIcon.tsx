import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { DataMartSchemaFieldStatus } from '../../../../../shared/types/data-mart-schema.types';

/**
 * Props for the SchemaFieldStatusIcon component
 */
interface SchemaFieldStatusIconProps {
  /** The status of the field */
  status: DataMartSchemaFieldStatus;
}

/**
 * Configuration for each status type
 */
const statusConfig = {
  [DataMartSchemaFieldStatus.CONNECTED]: {
    icon: CircleCheck,
    color: 'text-green-500',
    label: 'Connected',
    description: 'Field is connected to the data source',
  },
  [DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH]: {
    icon: TriangleAlert,
    color: 'text-orange-500',
    label: 'Connected with issues',
    description: 'Field is connected but has definition mismatches',
  },
  [DataMartSchemaFieldStatus.DISCONNECTED]: {
    icon: OctagonAlert,
    color: 'text-red-500',
    label: 'Disconnected',
    description: 'Field is not connected to the data source',
  },
} as const;

/**
 * Component that displays an icon representing the status of a schema field
 */
export function SchemaFieldStatusIcon({ status }: SchemaFieldStatusIconProps) {
  // Handle case when status is not a valid enum value
  if (!(status in statusConfig)) {
    return null;
  }

  const config = statusConfig[status];
  const { icon: Icon, color, label, description } = config;

  // Generate unique ID for tooltip
  const tooltipId = `schema-field-status-tooltip-${status}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon
            className={cn('h-5 w-5', color)}
            role='img'
            aria-label={label}
            aria-describedby={tooltipId}
            tabIndex={0}
          />
        </TooltipTrigger>
        <TooltipContent id={tooltipId} side='bottom' role='tooltip'>
          <div className='text-xs font-medium'>{label}</div>
          <div className='mt-1 max-w-xs text-xs break-words whitespace-normal'>{description}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
