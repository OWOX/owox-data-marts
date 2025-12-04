import type { SupportMenuItem } from './types';
import { Info, Clapperboard, MessagesSquare, Rocket, TvMinimalPlay } from 'lucide-react';

export const SupportMenuItems: SupportMenuItem[] = [
  {
    type: 'item',
    title: 'What´s new',
    icon: Rocket,
    mark: true,
  },
  { type: 'separator' },
  {
    type: 'item',
    title: 'Documentation',
    href: 'https://docs.owox.com/?utm_source=community_edition&utm_medium=organic&utm_campaign=documentation&utm_content=header_dropdown',
    icon: Info,
  },
  {
    type: 'submenu',
    title: 'Video tutorials',
    icon: Clapperboard,
    mark: true,
    submenu: {
      options: [
        { label: 'Video 1', icon: TvMinimalPlay, mark: true },
        { label: 'Video 2', icon: TvMinimalPlay },
        { label: 'Video 3', icon: TvMinimalPlay },
      ],
    },
  },
  { type: 'separator' },
  {
    type: 'item',
    title: 'Online Chat',
    icon: MessagesSquare,
  },
];
