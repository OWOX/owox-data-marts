import { useState, type FC } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';

/**
 * Component for displaying a context menu of actions on the Destination in a table.
 *
 * @param id - destination identifier
 * @param onViewDetails - view details handler
 * @param onEdit - edit handler
 * @param onDelete - delete handler
 */
interface DataDestinationActionsCellProps {
  id: string;
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
}

export const DataDestinationActionsCell: FC<DataDestinationActionsCellProps> = ({
  id,
  onEdit,
  onDelete,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className='text-right'>
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
            onClick={() => void onEdit?.(id)}
            className='dm-card-table-body-row-actiondropdownitem'
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete?.(id)}
            className='dm-card-table-body-row-actiondropdownitem text-red-600'
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
