import type { HelpMenuItem } from './types';
import { Info, Clapperboard, MessagesSquare, Rocket, Airplay } from 'lucide-react';
import { SlackIconDesaturated } from '../../../shared';
import { openIntercom } from '../../../app/intercom/intercomUtils';

export function helpMenuItems(openPopover: (id: string) => void): HelpMenuItem[] {
  return [
    {
      type: 'menu-item',
      title: 'What´s new',
      icon: Rocket,
      href: 'https://docs.owox.com/docs/changelog/?utm_source=community_edition&utm_medium=organic&utm_campaign=support_menu_dropdown&utm_content=whats_new',
      visible: true,
    },
    { type: 'separator' },
    {
      type: 'menu-item',
      title: 'Documentation',
      href: 'https://docs.owox.com/?utm_source=community_edition&utm_medium=organic&utm_campaign=support_menu_dropdown&utm_content=documentation',
      icon: Info,
      visible: { flagKey: 'MENU_DOCUMENTATION_COMMUNITY_EDITION_VISIBLE', expectedValue: 'true' },
    },
    {
      type: 'menu-item',
      title: 'Documentation',
      href: 'https://docs.owox.com/?utm_source=app_owox_com&utm_medium=organic&utm_campaign=support_menu_dropdown&utm_content=documentation',
      icon: Info,
      visible: { flagKey: 'MENU_DOCUMENTATION_OWOX_CLOUD_VISIBLE', expectedValue: 'true' },
    },
    {
      type: 'submenu',
      title: 'Video tutorials',
      icon: Clapperboard,
      visible: true,
      submenu: {
        options: [
          {
            label: 'Getting Started with Data Marts',
            icon: Airplay,
            onClick: () => {
              openPopover('video-3-getting-started-with-data-marts');
            },
          },
          {
            label: 'SQL to Google Sheets in Minutes',
            icon: Airplay,
            onClick: () => {
              openPopover('video-1-google-sheets');
            },
          },
          {
            label: 'Looker Studio Setup',
            icon: Airplay,
            onClick: () => {
              openPopover('video-2-looker');
            },
          },
        ],
      },
    },
    { type: 'separator' },
    {
      type: 'menu-item',
      title: 'Slack Community',
      href: 'https://join.slack.com/t/owox-data-marts/shared_invite/zt-3fffrsau9-UlobJVlXzRLpXmvs0ffvoQ',
      icon: SlackIconDesaturated,
      visible: true,
    },
    {
      type: 'menu-item',
      title: 'Online Chat',
      icon: MessagesSquare,
      onClick: () => {
        openIntercom();
      },
      visible: true,
    },
  ];
}
