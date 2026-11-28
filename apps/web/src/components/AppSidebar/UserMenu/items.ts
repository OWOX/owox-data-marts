import { CircleUserRound, FileText, LogOut, Monitor, Moon, Shield, Sun } from 'lucide-react';
import { appHelpLinks } from '../../../shared/constants/app-help-links';
import type { UserMenuItem } from './types';

export const UserMenuItems = ({
  theme,
  setTheme,
  signOut,
  openMyAccount,
  showLegalLinks,
}: {
  theme: string | undefined;
  setTheme: (theme: string) => void;
  signOut: () => void;
  openMyAccount?: () => void;
  showLegalLinks: boolean;
}): UserMenuItem[] => [
  ...(openMyAccount
    ? [
        {
          type: 'item' as const,
          title: 'My profile',
          icon: CircleUserRound,
          onClick: openMyAccount,
        },
      ]
    : []),
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
  ...(showLegalLinks
    ? [
        { type: 'separator' as const },
        {
          type: 'link' as const,
          title: 'Privacy policy',
          icon: Shield,
          href: appHelpLinks.privacyPolicy,
        },
        {
          type: 'link' as const,
          title: 'Terms of service',
          icon: FileText,
          href: appHelpLinks.termsOfService,
        },
      ]
    : []),
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
