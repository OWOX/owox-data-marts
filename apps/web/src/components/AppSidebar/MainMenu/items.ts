import { Box, DatabaseIcon, ArchiveRestore } from 'lucide-react';
import type { MainMenuItem } from './types';

export const MainMenuItems: MainMenuItem[] = [
  {
    title: 'Data Marts',
    url: '/data-marts',
    icon: Box,
  },
  {
    title: 'Storages',
    url: '/data-storages',
    icon: DatabaseIcon,
  },
  {
    title: 'Destinations',
    url: '/data-destinations',
    icon: ArchiveRestore,
  },
];
