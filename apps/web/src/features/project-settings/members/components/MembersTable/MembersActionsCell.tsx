import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { MoreHorizontal, Pencil, UserMinus } from 'lucide-react';
import { type FC, useState } from 'react';
import { AdminGuardTooltip } from '../../../../../shared/components/AdminGuardTooltip';

const ADMIN_ONLY_HINT = 'You need the Project Admin role to manage members.';

interface MembersActionsCellProps {
  userId: string;
  role: string;
  isAdmin: boolean;
  onEdit?: (userId: string) => void;
  onRemove?: (userId: string) => void;
}

export const MembersActionsCell: FC<MembersActionsCellProps> = ({
  userId,
  role,
  isAdmin,
  onEdit,
  onRemove,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const canRemove = role !== 'admin';

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
          <AdminGuardTooltip isAdmin={isAdmin} hint={ADMIN_ONLY_HINT}>
            <DropdownMenuItem
              disabled={!isAdmin}
              onClick={() => {
                if (!isAdmin) return;
                onEdit?.(userId);
              }}
            >
              <Pencil className='text-foreground h-4 w-4' aria-hidden='true' />
              <span>Edit</span>
            </DropdownMenuItem>
          </AdminGuardTooltip>
          {canRemove && (
            <>
              <DropdownMenuSeparator />
              <AdminGuardTooltip isAdmin={isAdmin} hint={ADMIN_ONLY_HINT}>
                <DropdownMenuItem
                  disabled={!isAdmin}
                  onClick={() => {
                    if (!isAdmin) return;
                    onRemove?.(userId);
                  }}
                >
                  <UserMinus className='h-4 w-4 text-red-600' aria-hidden='true' />
                  <span className='text-red-600'>Remove from project</span>
                </DropdownMenuItem>
              </AdminGuardTooltip>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
