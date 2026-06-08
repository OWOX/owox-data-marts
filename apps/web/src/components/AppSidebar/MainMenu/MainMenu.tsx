import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@owox/ui/components/collapsible';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@owox/ui/components/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { useProjectRoute } from '../../../shared/hooks';
import { storageService } from '../../../services';
import { MainMenuItems } from './items';
import type { MainMenuItem } from './types';

const PROJECT_WIDE_DATA_MART_PATHS = [
  '/data-marts/runs',
  '/data-marts/schedules',
  '/data-marts/reports',
  '/data-marts/insights',
];
const MAIN_MENU_BRANCH_STORAGE_PREFIX = 'owox.main-menu.branch-open';

export function MainMenu() {
  const { scope } = useProjectRoute();
  const location = useLocation();

  return (
    <SidebarMenu>
      {MainMenuItems.map(item =>
        item.children?.length ? (
          <MainMenuBranch key={item.title} item={item} pathname={location.pathname} scope={scope} />
        ) : (
          <MainMenuLeaf key={item.title} item={item} pathname={location.pathname} scope={scope} />
        )
      )}
    </SidebarMenu>
  );
}

interface MainMenuItemProps {
  item: MainMenuItem;
  pathname: string;
  scope: (path: string) => string;
}

function MainMenuLeaf({ item, pathname, scope }: MainMenuItemProps) {
  const Icon = item.icon;
  const href = scope(item.url);
  const isActive = isMenuItemActive(item.url, pathname, scope);

  return (
    <SidebarMenuItem key={item.title}>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <SidebarMenuButton
            asChild
            isActive={isActive}
            className={getActiveMenuItemClassName(isActive)}
          >
            <Link to={href} aria-current={isActive ? 'page' : undefined}>
              <Icon className='size-4 shrink-0 transition-all' />
              <span>{item.title}</span>
              {item.badge && (
                <span className='bg-primary/20 text-primary ml-auto rounded-full px-2 py-0.5 text-xs'>
                  {item.badge}
                </span>
              )}
            </Link>
          </SidebarMenuButton>
        </TooltipTrigger>
        <TooltipContent side='right'>{item.title}</TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}

function MainMenuBranch({ item, pathname, scope }: MainMenuItemProps) {
  const Icon = item.icon;
  const href = scope(item.url);
  const isActive = isMenuItemActive(item.url, pathname, scope);
  const hasActiveChild = item.children?.some(child => isMenuItemActive(child.url, pathname, scope));
  const [isOpen, setIsOpen] = useState(
    () => Boolean(hasActiveChild) || readStoredBranchOpenState(item.url)
  );

  useEffect(() => {
    if (hasActiveChild) {
      setIsOpen(true);
    }
  }, [hasActiveChild]);

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    writeStoredBranchOpenState(item.url, nextOpen);
  };

  return (
    <Collapsible asChild open={isOpen} onOpenChange={handleOpenChange}>
      <SidebarMenuItem key={item.title}>
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              className={getActiveMenuItemClassName(isActive)}
            >
              <Link to={href} aria-current={isActive ? 'page' : undefined}>
                <Icon className='size-4 shrink-0 transition-all' />
                <span>{item.title}</span>
                {item.badge && (
                  <span className='bg-primary/20 text-primary ml-auto rounded-full px-2 py-0.5 text-xs'>
                    {item.badge}
                  </span>
                )}
              </Link>
            </SidebarMenuButton>
          </TooltipTrigger>
          <TooltipContent side='right'>{item.title}</TooltipContent>
        </Tooltip>

        <CollapsibleTrigger asChild>
          <SidebarMenuAction
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.title}`}
            className='cursor-pointer'
          >
            <ChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </SidebarMenuAction>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children?.map(child => {
              const ChildIcon = child.icon;
              const childHref = scope(child.url);
              const isChildActive = isMenuItemActive(child.url, pathname, scope);

              return (
                <SidebarMenuSubItem key={child.title}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isChildActive}
                    className={getActiveMenuItemClassName(isChildActive)}
                  >
                    <Link to={childHref} aria-current={isChildActive ? 'page' : undefined}>
                      <ChildIcon className='size-4 shrink-0 transition-all' />
                      <span>{child.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function getActiveMenuItemClassName(isActive: boolean): string {
  return isActive
    ? 'bg-sidebar-active text-sidebar-active-foreground font-medium shadow-sm hover:bg-transparent'
    : '';
}

function isMenuItemActive(
  itemUrl: string,
  pathname: string,
  scope: (path: string) => string
): boolean {
  if (itemUrl === '/data-marts') {
    const isProjectWideDataMartPage = PROJECT_WIDE_DATA_MART_PATHS.some(path =>
      isSameOrNestedPath(pathname, scope(path))
    );

    if (isProjectWideDataMartPage) {
      return false;
    }
  }

  return isSameOrNestedPath(pathname, scope(itemUrl));
}

function isSameOrNestedPath(pathname: string, targetPath: string): boolean {
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

function readStoredBranchOpenState(itemUrl: string): boolean {
  return storageService.get(getBranchStorageKey(itemUrl), 'boolean') ?? false;
}

function writeStoredBranchOpenState(itemUrl: string, isOpen: boolean): void {
  storageService.set(getBranchStorageKey(itemUrl), isOpen);
}

function getBranchStorageKey(itemUrl: string): string {
  return `${MAIN_MENU_BRANCH_STORAGE_PREFIX}:${itemUrl}`;
}
