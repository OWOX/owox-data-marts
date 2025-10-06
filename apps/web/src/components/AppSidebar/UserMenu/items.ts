import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import type { UserMenuItem } from './types';

export const UserMenuItems = ({
  theme,
  setTheme,
  signOut,
}: {
  theme: string | undefined;
  setTheme: (theme: string) => void;
  signOut: () => void;
}): UserMenuItem[] => [
  {
    type: 'submenu',
    title: 'Appearance',
    icon: getAppearanceIcon(theme),
    submenu: {
      value: theme,
      onChange: (value: string) => {
        setTheme(value);
      },
      options: [
        { value: 'system', label: 'System', icon: Monitor },
        { value: 'light', label: 'Light', icon: Sun },
        { value: 'dark', label: 'Dark', icon: Moon },
      ],
    },
  },
  { type: 'separator' },
  {
    type: 'item',
    title: 'Sign out',
    icon: LogOut,
    onClick: signOut,
    className: 'text-red-600 focus:text-red-600',
  },
];

function getAppearanceIcon(theme: string | undefined) {
  switch (theme) {
    case 'light':
      return Sun;
    case 'dark':
      return Moon;
    case 'system':
    default:
      return Monitor;
  }
}
