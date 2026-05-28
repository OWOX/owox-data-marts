import {
  BriefcaseBusiness,
  Bell,
  Gem,
  KeyRound,
  Settings,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from '@owox/ui/components/dropdown-menu';
import type { MouseEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useFlags } from '../../../app/store/hooks';
import { useProjectId } from '../../../shared/hooks';
import { checkVisible } from '../../../utils';
import { useProjectRoute } from '../../../shared/hooks';

type SettingsSubItem =
  | {
      kind: 'internal';
      title: string;
      /** Path relative to /project-settings, '' = index. For absolute paths starting with '/' — used as-is. */
      path: string;
      icon: LucideIcon;
      isVisible?: (isOwoxIdpProvider: boolean, flags: Record<string, unknown> | null) => boolean;
    }
  | {
      kind: 'external';
      title: string;
      /** Builds full external URL given the current projectId. */
      buildHref: (projectId: string) => string;
      icon: LucideIcon;
      isVisible?: (isOwoxIdpProvider: boolean, flags: Record<string, unknown> | null) => boolean;
    }
  | {
      kind: 'separator';
    };

const PLATFORM_BASE_URL =
  import.meta.env.VITE_OWOX_PLATFORM_URL?.replace(/\/$/, '') ?? 'https://platform.owox.com';

const settingsItems: SettingsSubItem[] = [
  { kind: 'internal', title: 'Overview', path: '', icon: Settings },
  { kind: 'internal', title: 'Members', path: 'members', icon: Users },
  { kind: 'internal', title: 'Contexts', path: 'contexts', icon: Tags },
  {
    kind: 'external',
    title: 'Credit consumption',
    buildHref: id => `${PLATFORM_BASE_URL}/ui/p/${id}/settings/consumption`,
    icon: Gem,
    isVisible: isOwoxIdpProvider => isOwoxIdpProvider,
  },
  {
    kind: 'external',
    title: 'Subscription',
    buildHref: id => `${PLATFORM_BASE_URL}/ui/p/${id}/settings/subscription`,
    icon: BriefcaseBusiness,
    isVisible: isOwoxIdpProvider => isOwoxIdpProvider,
  },
  { kind: 'internal', title: 'Notifications', path: 'notifications', icon: Bell },
  { kind: 'separator' },
  {
    kind: 'internal',
    title: 'My API Keys',
    path: '/me/api-keys',
    icon: KeyRound,
    isVisible: (_isOwoxIdpProvider, flags) => checkVisible('API_KEYS_ENABLED', 'true', flags),
  },
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

  const visible = settingsItems.filter(item => {
    if (item.kind === 'separator') return true;
    return item.isVisible?.(isOwoxIdpProvider, flags) ?? true;
  });

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
          {visible.map((item, index) => {
            if (item.kind === 'separator') {
              return <DropdownMenuSeparator key={`sep-${String(index)}`} />;
            }
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
            const to = item.path.startsWith('/')
              ? scope(item.path)
              : scope(`/project-settings${item.path ? `/${item.path}` : ''}`);
            return (
              <DropdownMenuItem asChild key={item.path || 'overview'}>
                <NavLink to={to} className='flex items-center gap-2'>
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
