import { useTableFilters } from './TableFilters';
import { PopoverTrigger } from '@owox/ui/components/popover';
import { Button } from '@owox/ui/components/button';
import { Filter, ChevronDown } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { Badge } from '@owox/ui/components/badge';

interface TableFiltersTriggerProps {
  label?: string;
  icon?: React.ElementType;
}

export function TableFiltersTrigger({
  label = 'Filters',
  icon: Icon = Filter,
}: TableFiltersTriggerProps) {
  const { open, appliedState } = useTableFilters();

  const badgeCount = appliedState.filters.length;
  const isActive = badgeCount > 0;

  return (
    <PopoverTrigger asChild>
      <Button variant='outline' size='sm' className='h-9'>
        <Icon className='size-4' />
        <span className='hidden md:block'>{label}</span>
        {isActive && (
          <Badge className='bg-brand-blue-500 rounded-full px-1.5 py-0 text-xs text-white'>
            {badgeCount}
          </Badge>
        )}
        <ChevronDown
          className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
        />
      </Button>
    </PopoverTrigger>
  );
}
