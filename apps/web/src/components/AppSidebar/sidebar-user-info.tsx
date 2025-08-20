import { useState } from 'react';
import { ChevronDown, LogOut, Moon, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { useAuth } from '../../features/idp/hooks';
import { useTheme } from 'next-themes';

interface UserMenuItem {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  className?: string;
}

/**
 * Generate user initials from fullName or email
 */
function generateInitials(fullName?: string | null, email?: string | null): string {
  if (fullName) {
    const names = fullName.trim().split(' ').filter(Boolean);
    if (names.length >= 2) {
      return `${names[0]?.[0] ?? ''}${names[1]?.[0] ?? ''}`.toUpperCase();
    }
    return names[0]?.[0]?.toUpperCase() || '';
  }

  if (email?.includes('@')) {
    const emailPart = email.split('@')[0];
    if (emailPart.length > 2) {
      return `${emailPart[0]}${emailPart[1]}`.toUpperCase();
    }
    return emailPart[0].toUpperCase();
  }

  return 'U';
}

export function SidebarUserInfo() {
  const { user, signOut } = useAuth();
  const { setTheme, theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) {
    return null;
  }

  const initials = generateInitials(user.fullName, user.email);
  const displayName = user.fullName ?? user.email ?? 'Unknown User';

  const menuItems: UserMenuItem[] = [
    {
      title: `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`,
      icon: theme === 'light' ? Moon : Sun,
      onClick: () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
      },
    },
    {
      title: 'Sign out',
      icon: LogOut,
      onClick: signOut,
      className: 'text-red-600 focus:text-red-600',
    },
  ];

  return (
    <div
      data-slot='sidebar-menu-item'
      data-sidebar='menu-item'
      className='group/menu-item relative'
    >
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            data-slot='dropdown-menu-trigger'
            data-sidebar='menu-button'
            data-size='lg'
            data-active={isOpen ? 'true' : 'false'}
            aria-haspopup='menu'
            aria-expanded={isOpen}
            data-state={isOpen ? 'open' : 'closed'}
            className='peer/menu-button ring-sidebar-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0'
          >
            <div className='text-muted-foreground flex aspect-square size-8 items-center justify-center rounded-md border bg-white text-sm font-medium dark:bg-white/10'>
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={displayName}
                  className='size-full rounded-full object-cover'
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <div className='grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden'>
              <span className='truncate font-medium'>{displayName}</span>
              {user.email && user.fullName && (
                <span className='text-muted-foreground truncate text-xs'>{user.email}</span>
              )}
            </div>

            <ChevronDown
              className={`ml-auto size-4 transition-transform duration-200 group-data-[collapsible=icon]:hidden ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align='start' side='top' sideOffset={8} className='w-56'>
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const isSignOutItem = item.title === 'Sign out';

            return (
              <div key={`${item.title}-${String(index)}`}>
                {isSignOutItem && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={item.onClick}
                  className={`flex items-center gap-2 ${item.className ?? ''}`}
                >
                  <Icon className='size-4' />
                  {item.title}
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
