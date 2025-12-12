import { useState } from 'react';
import { DropdownMenu } from '@owox/ui/components/dropdown-menu';
import { helpMenuItems } from './items';
import { HelpMenuTrigger } from './HelpMenuTrigger';
import { HelpMenuContent } from './HelpMenuContent';
import { useHelpMenu } from './useHelpMenu';
import { useContentPopovers } from '../../../app/store/hooks/useContentPopovers';

export function HelpMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { open } = useContentPopovers();

  const rawItems = helpMenuItems(open);
  const { visibleItems } = useHelpMenu(rawItems);

  return (
    <div data-slot='sidebar-header' data-sidebar='header' className='flex flex-col gap-2'>
      <ul
        data-slot='sidebar-menu'
        data-sidebar='menu'
        className='flex w-full min-w-0 flex-col gap-1'
      >
        <li
          data-slot='sidebar-menu-item'
          data-sidebar='menu-item'
          className='group/menu-item relative'
        >
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <HelpMenuTrigger isOpen={isOpen} />
            <HelpMenuContent
              items={visibleItems}
              onClose={() => {
                setIsOpen(false);
              }}
            />
          </DropdownMenu>
        </li>
      </ul>
    </div>
  );
}
