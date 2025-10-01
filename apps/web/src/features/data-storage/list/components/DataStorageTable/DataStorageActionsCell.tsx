import { useState, type FC } from 'react';
import { MoreHorizontal, Pencil, Trash2, Eye } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';

/**
 * Component for displaying a context menu of actions on the data storage in a table.
 *
 * @param id - storage identifier
 * @param onViewDetails - view details handler
 * @param onEdit - edit handler
 * @param onDelete - delete handler
 */
interface DataStorageActionsCellProps {
  id: string;
  onViewDetails?: (id: string) => void;
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
}

export const DataStorageActionsCell: FC<DataStorageActionsCellProps> = ({
  id,
  onViewDetails,
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
          <DropdownMenuItem onClick={() => onViewDetails?.(id)}>
            <Eye className='text-foreground h-4 w-4' aria-hidden='true' />
            <span>View details</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void onEdit?.(id)}>
            <Pencil className='text-foreground h-4 w-4' aria-hidden='true' />
            <span>Edit</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDelete?.(id)}>
            <Trash2 className='h-4 w-4 text-red-600' aria-hidden='true' />
            <span className='text-red-600'>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
