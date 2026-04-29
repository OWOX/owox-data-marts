import { BriefcaseBusiness, Bell, Gem, Settings, Tags, Users, type LucideIcon } from 'lucide-react';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from '@owox/ui/components/dropdown-menu';
import type { MouseEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useFlags } from '../../../app/store/hooks';
import { useProjectId } from '../../../shared/hooks/useProjectId';
import { checkVisible } from '../../../utils/check-visible';
import { useProjectRoute } from '../../../shared/hooks';

type SettingsSubItem =
  | {
      kind: 'internal';
      title: string;
      /** Path relative to /project-settings, '' = index. */
      path: string;
      icon: LucideIcon;
      isVisible?: (isOwoxIdpProvider: boolean) => boolean;
    }
  | {
      kind: 'external';
      title: string;
      /** Builds full external URL given the current projectId. */
      buildHref: (projectId: string) => string;
      icon: LucideIcon;
      isVisible?: (isOwoxIdpProvider: boolean) => boolean;
    };

const settingsItems: SettingsSubItem[] = [
  { kind: 'internal', title: 'Overview', path: '', icon: Settings },
  { kind: 'internal', title: 'Members', path: 'members', icon: Users },
  { kind: 'internal', title: 'Contexts', path: 'contexts', icon: Tags },
  {
    kind: 'external',
    title: 'Credit consumption',
    buildHref: id => `https://platform.owox.com/ui/p/${id}/settings/consumption`,
    icon: Gem,
    isVisible: isOwoxIdpProvider => isOwoxIdpProvider,
  },
  {
    kind: 'external',
    title: 'Subscription',
    buildHref: id => `https://platform.owox.com/ui/p/${id}/settings/subscription`,
    icon: BriefcaseBusiness,
    isVisible: isOwoxIdpProvider => isOwoxIdpProvider,
  },
  { kind: 'internal', title: 'Notifications', path: 'notifications', icon: Bell },
];

/**
 * Sub-dropdown that mirrors `SwitchProjectMenu`: the parent dropdown shows
 * a single "Project settings" trigger which expands into the full list of
 * project-settings tabs. Keeps the parent menu compact while exposing every
 * sub-page in one hover.
 */
interface ProjectSettingsSubmenuProps {
  onClose: () => void;
}

export function ProjectSettingsSubmenu({ onClose }: ProjectSettingsSubmenuProps) {
  const { flags } = useFlags();
  const { scope } = useProjectRoute();
  const projectId = useProjectId();
  const navigate = useNavigate();
  const isOwoxIdpProvider = checkVisible('IDP_PROVIDER', ['owox-better-auth'], flags);

  const visible = settingsItems.filter(item => item.isVisible?.(isOwoxIdpProvider) ?? true);

  const handleTriggerClick = (event: MouseEvent) => {
    event.preventDefault();
    void navigate(scope('/project-settings'));
    onClose();
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        className='flex cursor-pointer items-center gap-2'
        onClick={handleTriggerClick}
      >
        <Settings className='h-4 w-4' />
        Project settings
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          {visible.map(item => {
            const Icon = item.icon;
            if (item.kind === 'external') {
              if (!projectId) return null;
              return (
                <DropdownMenuItem asChild key={item.title}>
                  <a
                    href={item.buildHref(projectId)}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex items-center gap-2'
                  >
                    <Icon className='h-4 w-4' />
                    {item.title}
                  </a>
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem asChild key={item.path || 'overview'}>
                <NavLink
                  to={scope(`/project-settings${item.path ? `/${item.path}` : ''}`)}
                  className='flex items-center gap-2'
                >
                  <Icon className='h-4 w-4' />
                  {item.title}
                </NavLink>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
