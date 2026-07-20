import {
  ArchiveRestore,
  Box,
  CalendarClock,
  DatabaseIcon,
  FileText,
  HistoryIcon,
  Network,
  Bookmark,
} from 'lucide-react';
import type { MainMenuItem } from './types';

export const MainMenuItems: MainMenuItem[] = [
  {
    title: 'Data Marts',
    url: '/data-marts',
    icon: Box,
    children: [
      {
        title: 'Models',
        url: '/data-marts/models',
        icon: Network,
      },
      {
        title: 'Reports',
        url: '/data-marts/reports',
        icon: FileText,
      },
      {
        title: 'Insights',
        url: '/data-marts/insights',
        icon: Bookmark,
      },
      {
        title: 'Triggers',
        url: '/data-marts/schedules',
        icon: CalendarClock,
      },
      {
        title: 'Run History',
        url: '/data-marts/runs',
        icon: HistoryIcon,
      },
    ],
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
