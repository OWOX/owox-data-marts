import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useInsightsPermissions } from '../../hooks/useInsightsPermissions';
import { NO_PERMISSION_MESSAGE } from '../../../../../app/permissions';

interface ActionsCellProps {
  id: string;
  onDelete?: (id: string) => void;
}

export function InsightActionsCell({ id, onDelete }: ActionsCellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { canDelete } = useInsightsPermissions();

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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='w-full'>
                <DropdownMenuItem
                  className='text-destructive'
                  onClick={() => onDelete?.(id)}
                  disabled={!canDelete}
                >
                  <Trash2 className='h-4 w-4 text-red-600' />
                  <span className='text-red-600'>Delete insight</span>
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            {!canDelete && <TooltipContent side='left'>{NO_PERMISSION_MESSAGE}</TooltipContent>}
          </Tooltip>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
