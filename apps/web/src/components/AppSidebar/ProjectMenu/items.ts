import type { ProjectMenuItem } from './types';
import { GitHubIcon } from '../../../shared';
import { Gem, AlertCircle, Scale, MessageCircle } from 'lucide-react';

export const projectMenuItems: ProjectMenuItem[] = [
  {
    title: 'GitHub Community',
    href: 'https://github.com/OWOX/owox-data-marts',
    icon: GitHubIcon,
  },
  {
    title: 'Discover Upgrade Options',
    href: 'https://www.owox.com/pricing/?utm_source=bi_owox_com&utm_medium=community_edition&utm_campaign=pricing&utm_keyword=upgrade_options&utm_content=header_dropdown',
    icon: Gem,
  },
  {
    type: 'separator',
  },
  {
    title: 'Leave your feedback',
    href: 'https://github.com/OWOX/owox-data-marts/discussions',
    icon: MessageCircle,
  },
  {
    title: 'Issues',
    href: 'https://github.com/OWOX/owox-data-marts/issues',
    icon: AlertCircle,
  },
  {
    type: 'separator',
  },
  {
    title: 'License',
    href: 'https://github.com/OWOX/owox-data-marts#License-1-ov-file',
    icon: Scale,
  },
];
