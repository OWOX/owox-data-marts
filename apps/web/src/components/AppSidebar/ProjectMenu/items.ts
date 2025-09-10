import type { ProjectMenuItem } from './types';
import { GitHubIcon, OWOXBIIcon } from '../../../shared';
import {
  Gem,
  AlertCircle,
  Scale,
  MessageCircle,
  Settings,
  BriefcaseBusiness,
  Users,
  ArrowRightLeft,
  MessageCircleQuestion,
} from 'lucide-react';

export const projectMenuItems: ProjectMenuItem[] = [
  {
    title: 'GitHub Community',
    href: 'https://github.com/OWOX/owox-data-marts',
    icon: GitHubIcon,
    visible: true,
  },
  {
    title: 'Discover Upgrade Options',
    href: 'https://www.owox.com/pricing/?utm_source=bi_owox_com&utm_medium=community_edition&utm_campaign=pricing&utm_keyword=upgrade_options&utm_content=header_dropdown',
    icon: Gem,
    visible: true,
  },
  {
    type: 'separator',
    visible: true,
  },
  {
    title: 'Leave your feedback',
    href: 'https://github.com/OWOX/owox-data-marts/discussions',
    icon: MessageCircle,
    visible: true,
  },
  {
    title: 'Issues',
    href: 'https://github.com/OWOX/owox-data-marts/issues',
    icon: AlertCircle,
    visible: true,
  },
  {
    type: 'separator',
    visible: true,
  },
  {
    title: 'License',
    href: 'https://github.com/OWOX/owox-data-marts#License-1-ov-file',
    icon: Scale,
    visible: true,
  },
  {
    type: 'separator',
    visible: false,
  },
  {
    title: 'Project settings',
    href: 'https://platform.owox.com/ui/p/none/settings/general',
    icon: Settings,
    visible: false,
  },
  {
    title: 'Credits consumption',
    href: 'https://platform.owox.com/ui/p/none/settings/consumption',
    icon: Gem,
    visible: false,
  },
  {
    title: 'Subscription',
    href: 'https://platform.owox.com/ui/p/none/settings/subscription',
    icon: BriefcaseBusiness,
    visible: false,
  },
  {
    title: 'Members',
    href: 'https://platform.owox.com/ui/p/none/settings/members',
    icon: Users,
    visible: false,
  },
  {
    type: 'separator',
    visible: false,
  },
  {
    title: 'OWOX BI',
    href: 'https://bi.owox.com/',
    icon: OWOXBIIcon,
    visible: false,
  },
  {
    title: 'Help Center',
    href: 'https://support.owox.com/',
    icon: MessageCircleQuestion,
    visible: false,
  },
  {
    type: 'separator',
    visible: false,
  },
  {
    type: 'switcher',
    title: 'Switch project',
    icon: ArrowRightLeft,
    visible: false,
  },
];
