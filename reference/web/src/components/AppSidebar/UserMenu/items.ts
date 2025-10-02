import { LogOut, Moon, Sun } from 'lucide-react';
import type { UserMenuItem } from './types';

interface UserMenuItemsParams {
  theme: string | undefined;
  setTheme: (theme: string) => void;
  signOut: () => void;
}

export function UserMenuItems({ theme, setTheme, signOut }: UserMenuItemsParams): UserMenuItem[] {
  return [
    {
      title: `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`,
      icon: theme === 'light' ? Moon : Sun,
      onClick: () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
      },
    },
    { type: 'separator' },
    {
      title: 'Sign out',
      icon: LogOut,
      onClick: signOut,
      className: 'text-red-600 focus:text-red-600',
    },
  ];
}
