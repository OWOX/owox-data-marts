import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { type FC, type ReactNode, useState } from 'react';

const ADMIN_ONLY_HINT = 'You need the Project Admin role to manage contexts.';

interface ContextsActionsCellProps {
  contextId: string;
  isAdmin: boolean;
  onEdit?: (contextId: string) => void;
  onDelete?: (contextId: string) => void;
}

export const ContextsActionsCell: FC<ContextsActionsCellProps> = ({
  contextId,
  isAdmin,
  onEdit,
  onDelete,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const withHint = (node: ReactNode): ReactNode =>
    isAdmin ? (
      node
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='inline-flex w-full'>{node}</span>
        </TooltipTrigger>
        <TooltipContent side='left'>{ADMIN_ONLY_HINT}</TooltipContent>
      </Tooltip>
    );

  return (
    <div className='actions-cell text-right'>
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
          {withHint(
            <DropdownMenuItem
              disabled={!isAdmin}
              onClick={() => {
                if (!isAdmin) return;
                onEdit?.(contextId);
              }}
            >
              <Pencil className='text-foreground h-4 w-4' aria-hidden='true' />
              <span>Edit</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {withHint(
            <DropdownMenuItem
              disabled={!isAdmin}
              onClick={() => {
                if (!isAdmin) return;
                onDelete?.(contextId);
              }}
            >
              <Trash2 className='h-4 w-4 text-red-600' aria-hidden='true' />
              <span className='text-red-600'>Delete</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
