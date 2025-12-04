import { useState } from 'react';
import { DropdownMenu } from '@owox/ui/components/dropdown-menu';
import { SupportMenuItems } from './items';
import { SupportMenuTrigger } from './SupportMenuTrigger';
import { SupportMenuContent } from './SupportMenuContent';

export function SupportMenu() {
  const [isOpen, setIsOpen] = useState(false);

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
            <SupportMenuTrigger isOpen={isOpen} />
            <SupportMenuContent items={SupportMenuItems} />
          </DropdownMenu>
        </li>
      </ul>
    </div>
  );
}
