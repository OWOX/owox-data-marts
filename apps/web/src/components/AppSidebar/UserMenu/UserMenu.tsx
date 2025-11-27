import { useState } from 'react';
import { DropdownMenu } from '@owox/ui/components/dropdown-menu';
import { useTheme } from 'next-themes';
import { useAuth } from '../../../features/idp/hooks';
import { generateInitials } from '../../../shared/utils';
import { UserMenuItems } from './items';
import { UserMenuTrigger } from './UserMenuTrigger';
import { UserMenuContent } from './UserMenuContent';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { setTheme, theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const { fullName, email, avatar } = user;
  const displayName = fullName ?? email ?? 'Unknown User';
  const initials = generateInitials(fullName, email);

  return (
    <div
      data-slot='sidebar-menu-item'
      data-sidebar='menu-item'
      className='group/menu-item relative'
    >
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <UserMenuTrigger
          isOpen={isOpen}
          displayName={displayName}
          email={email}
          avatar={avatar}
          initials={initials}
        />
        <UserMenuContent items={UserMenuItems({ theme, setTheme, signOut })} />
      </DropdownMenu>
    </div>
  );
}
