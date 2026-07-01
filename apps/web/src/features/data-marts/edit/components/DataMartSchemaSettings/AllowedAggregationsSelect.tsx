import { ChevronDown } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { type ReportAggregateFunction } from '../../../shared/types/relationship.types';
import { supportedAggregationsForType } from '../../../shared/utils/aggregation-governance';

interface AllowedAggregationsSelectProps {
  value: readonly ReportAggregateFunction[];
  onChange: (next: ReportAggregateFunction[]) => void;
  /** Field type — the menu offers only the aggregations this type supports. */
  fieldType: string;
  ariaLabel: string;
  className?: string;
}

export function AllowedAggregationsSelect({
  value,
  onChange,
  fieldType,
  ariaLabel,
  className,
}: AllowedAggregationsSelectProps) {
  const supported = supportedAggregationsForType(fieldType);
  let label: string;
  if (value.length === 0) {
    label = 'None';
  } else if (value.length <= 2) {
    label = value.join(', ');
  } else {
    label = `${value.length} selected`;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          aria-label={ariaLabel}
          className={`h-8 w-full justify-between truncate font-normal${className ? ` ${className}` : ''}`}
        >
          <span className={`truncate ${value.length === 0 ? 'text-muted-foreground' : ''}`}>
            {label}
          </span>
          <ChevronDown className='ml-1 h-3.5 w-3.5 shrink-0 opacity-50' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        {supported.map(fn => (
          <DropdownMenuCheckboxItem
            key={fn}
            aria-label={fn}
            checked={value.includes(fn)}
            onCheckedChange={checked => {
              const next = checked
                ? supported.filter(f => f === fn || value.includes(f))
                : supported.filter(f => f !== fn && value.includes(f));
              onChange(next);
            }}
            onSelect={e => {
              e.preventDefault();
            }}
          >
            {fn}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
