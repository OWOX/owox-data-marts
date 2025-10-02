import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@owox/ui/components/dropdown-menu';
import type { UserMenuItem } from './types';

interface UserMenuContentProps {
  items: UserMenuItem[];
}

export function UserMenuContent({ items }: UserMenuContentProps) {
  return (
    <DropdownMenuContent align='start' side='top' sideOffset={8} className='w-56'>
      {items.map((item, index) =>
        item.type === 'separator' ? (
          <DropdownMenuSeparator key={`sep-${String(index)}`} />
        ) : (
          <DropdownMenuItem
            key={item.title}
            onClick={item.onClick}
            className={`flex items-center gap-2 ${item.className ?? ''}`}
          >
            <item.icon className='size-4' />
            {item.title}
          </DropdownMenuItem>
        )
      )}
    </DropdownMenuContent>
  );
}
