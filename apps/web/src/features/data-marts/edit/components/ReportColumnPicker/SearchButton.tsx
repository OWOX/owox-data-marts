import { Search } from 'lucide-react';

import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

interface SearchButtonProps {
  open: boolean;
  onClick: () => void;
}

export function SearchButton({ open, onClick }: SearchButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant={open ? 'secondary' : 'ghost'}
          size='sm'
          aria-label={open ? 'Close search' : 'Search columns'}
          aria-expanded={open}
          onClick={onClick}
          className='h-7 w-7'
        >
          <Search className='h-3.5 w-3.5' />
        </Button>
      </TooltipTrigger>

      <TooltipContent>Search columns</TooltipContent>
    </Tooltip>
  );
}
