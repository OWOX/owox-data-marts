import type { ProjectMenuItem } from './types';
import { GitHubIcon, OWOXBIIcon } from '../../../shared';
import { Gem, BadgeAlert, Scale, MessageCircle, Settings } from 'lucide-react';

export const projectMenuItems: ProjectMenuItem[] = [
  {
    type: 'menu-item',
    title: 'GitHub Community',
    href: 'https://github.com/OWOX/owox-data-marts',
    icon: GitHubIcon,
    visible: { flagKey: 'MENU_GITHUB_COMMUNITY_VISIBLE', expectedValue: 'true' },
    group: 'community',
  },
  {
    type: 'menu-item',
    title: 'Discover Upgrade Options',
    href: 'https://www.owox.com/pricing/?utm_source=bi_owox_com&utm_medium=community_edition&utm_campaign=pricing&utm_keyword=upgrade_options&utm_content=header_dropdown',
    icon: Gem,
    visible: { flagKey: 'MENU_UPGRADE_OPTIONS_VISIBLE', expectedValue: 'true' },
    group: 'community',
  },
  {
    type: 'menu-item',
    title: 'Project settings',
    href: '/project-settings',
    icon: Settings,
    visible: true,
    group: 'project',
    internal: true,
  },
  {
    type: 'menu-item',
    title: 'Leave Feedback',
    href: 'https://github.com/OWOX/owox-data-marts/discussions',
    icon: MessageCircle,
    visible: { flagKey: 'MENU_FEEDBACK_VISIBLE', expectedValue: 'true' },
    group: 'feedback',
  },
  {
    type: 'menu-item',
    title: 'Issues',
    href: 'https://github.com/OWOX/owox-data-marts/issues',
    icon: BadgeAlert,
    visible: { flagKey: 'MENU_ISSUES_VISIBLE', expectedValue: 'true' },
    group: 'feedback',
  },
  {
    type: 'menu-item',
    title: 'License',
    href: 'https://github.com/OWOX/owox-data-marts#License-1-ov-file',
    icon: Scale,
    visible: { flagKey: 'MENU_LICENSE_VISIBLE', expectedValue: 'true' },
    group: 'legal',
  },
  {
    type: 'menu-item',
    title: 'OWOX BI',
    href: 'https://bi.owox.com/',
    icon: OWOXBIIcon,
    visible: { flagKey: 'MENU_OWOX_BI_VISIBLE', expectedValue: 'true' },
    group: 'external',
  },
];
