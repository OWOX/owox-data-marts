import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@owox/ui/components/dropdown-menu';
import type { UserMenuItem } from './types';
import { CheckIcon } from 'lucide-react';

interface UserMenuContentProps {
  items: UserMenuItem[];
}

export function UserMenuContent({ items }: UserMenuContentProps) {
  return (
    <DropdownMenuContent align='start' side='top' sideOffset={8} className='w-56'>
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <DropdownMenuSeparator key={`sep-${String(index)}`} />;
        }

        if (item.type === 'submenu') {
          const { submenu } = item;

          return (
            <DropdownMenuSub key={item.title}>
              <DropdownMenuSubTrigger className='flex items-center gap-2 px-2 py-1.5'>
                <item.icon className='size-4' />
                {item.title}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {submenu.options.map(option => (
                  <DropdownMenuItem
                    key={option.value}
                    className='flex items-center gap-2 px-2 py-1.5'
                    onClick={() => {
                      submenu.onChange(option.value);
                    }}
                  >
                    {option.icon && <option.icon className='size-4' />}
                    {option.label}
                    {submenu.value === option.value && <CheckIcon className='ml-auto size-4' />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        }

        return (
          <DropdownMenuItem
            key={item.title}
            onClick={item.onClick}
            className={`flex items-center gap-2 px-2 py-1.5 ${item.className ?? ''}`}
          >
            <item.icon className={`size-4 ${item.className ?? ''}`} />
            {item.title}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  );
}
