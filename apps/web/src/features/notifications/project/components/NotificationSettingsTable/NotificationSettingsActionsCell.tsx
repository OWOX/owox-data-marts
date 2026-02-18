import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { MoreHorizontal, Pencil } from 'lucide-react';
import { useState } from 'react';
import type { NotificationSettingsItem } from '../../types';

interface NotificationSettingsActionsCellProps {
  setting: NotificationSettingsItem;
  onEdit: (setting: NotificationSettingsItem) => void;
}

export const NotificationSettingsActionsCell = ({
  setting,
  onEdit,
}: NotificationSettingsActionsCellProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className='text-right'>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className={`dm-card-table-body-row-actionbtn opacity-0 transition-opacity ${
              isMenuOpen ? 'opacity-100' : 'group-hover:opacity-100'
            }`}
            aria-label='Open menu'
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation();
              onEdit(setting);
            }}
          >
            <Pencil className='h-4 w-4' aria-hidden />
            <span>Edit settings</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
