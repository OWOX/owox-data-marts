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
import { type FC, useState } from 'react';
import { NO_PERMISSION_MESSAGE } from '../../../../../app/permissions';

interface ConnectorActionsCellProps {
  id: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}

/**
 * "Open in builder" stays enabled for a viewer on purpose: the builder route answers with
 * BuilderNotAuthorised, which explains why a manifest cannot be shown to them. Disabling it
 * would take that explanation away and leave the row inert with no reason given.
 */
export const ConnectorActionsCell: FC<ConnectorActionsCellProps> = ({
  id,
  onOpen,
  onDelete,
  canDelete,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className='actions-cell text-right'>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity ${isMenuOpen ? 'opacity-100' : 'group-hover:opacity-100'}`}
            aria-label='Open menu'
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onClick={() => {
              onOpen(id);
            }}
          >
            <Pencil className='text-foreground h-4 w-4' aria-hidden='true' />
            <span>Open in builder</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <Tooltip>
            {/* A disabled item fires no pointer events, so the wrapper is what the tooltip hangs on. */}
            <TooltipTrigger asChild>
              <div className='w-full'>
                <DropdownMenuItem
                  data-testid='connectorDeleteButton'
                  onClick={() => {
                    onDelete(id);
                  }}
                  disabled={!canDelete}
                >
                  <Trash2 className='h-4 w-4 text-red-600' aria-hidden='true' />
                  <span className='text-red-600'>Delete</span>
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            {!canDelete && <TooltipContent side='left'>{NO_PERMISSION_MESSAGE}</TooltipContent>}
          </Tooltip>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
