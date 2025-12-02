import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { MoreHorizontal, Trash2 } from 'lucide-react';

interface ActionsCellProps {
  id: string;
  onDelete?: (id: string) => void;
}

export function InsightActionsCell({ id, onDelete }: ActionsCellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div
      className='text-right'
      onClick={e => {
        e.stopPropagation();
      }}
    >
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity ${
              isMenuOpen ? 'opacity-100' : 'group-hover:opacity-100'
            }`}
            aria-label='Open menu'
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='end'>
          <DropdownMenuItem className='text-destructive' onClick={() => onDelete?.(id)}>
            <Trash2 className='h-4 w-4 text-red-600' />
            <span className='text-red-600'>Delete insight</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
