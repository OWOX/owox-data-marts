import { useMemo, useEffect } from 'react';
import { useProject, useFlags } from '../../../app/store/hooks';
import { projectMenuItems } from './items';
import { checkVisible } from '../../../utils/check-visible';
import type { ProjectMenuItem } from './types.ts';
import { useProjects } from '../../../features/idp/hooks/useProjects.ts';

type MenuItemWithSeparator = ProjectMenuItem | { type: 'separator'; visible: boolean };

export function useProjectMenu() {
  const { flags } = useFlags();
  const { loadProjects, projects } = useProjects();
  const { id } = useProject();

  const isOwoxIdpProvider = checkVisible('IDP_PROVIDER', 'owox', flags);

  useEffect(() => {
    if (isOwoxIdpProvider) {
      void loadProjects();
    }
  }, [loadProjects, isOwoxIdpProvider]);

  const canSwitchProject = projects.length > 1;

  const visibleMenuItems = useMemo(() => {
    const filteredItems = projectMenuItems.filter(item => {
      if (typeof item.visible === 'boolean') {
        return item.visible;
      }

      return checkVisible(item.visible.flagKey, item.visible.expectedValue, flags);
    });

    const mappedItems = filteredItems.map(item => {
      if (item.group === 'project' && item.href && id) {
        try {
          const updatedHref = item.href.replace('/p/none/', `/p/${id}/`);
          return { ...item, href: updatedHref } as ProjectMenuItem;
        } catch {
          return item;
        }
      }
      return item;
    });

    const groups = new Map<string, ProjectMenuItem[]>();
    mappedItems.forEach(item => {
      const group = item.group || 'default';
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      const groupItems = groups.get(group);
      if (groupItems) {
        groupItems.push(item);
      }
    });

    const result: MenuItemWithSeparator[] = [];
    const groupEntries = Array.from(groups.entries()).filter(([, items]) => items.length > 0);

    groupEntries.forEach(([, items], groupIndex) => {
      result.push(...items);

      if (groupIndex < groupEntries.length - 1) {
        result.push({
          type: 'separator',
          visible: true,
        });
      }
    });

    return result;
  }, [flags, id]);

  return { visibleMenuItems, canSwitchProject };
}
