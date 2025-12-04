import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@owox/ui/components/dropdown-menu';
import type { SupportMenuItem } from './types';

interface SupportMenuContentProps {
  items: SupportMenuItem[];
}

export function SupportMenuContent({ items }: SupportMenuContentProps) {
  return (
    <DropdownMenuContent align='start' side='right' className='w-56'>
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <DropdownMenuSeparator key={`sep-${String(index)}`} />;
        }

        if (item.type === 'submenu') {
          const { submenu } = item;

          return (
            <DropdownMenuSub key={item.title}>
              <DropdownMenuSubTrigger className='flex items-center gap-2 px-2 py-1.5'>
                <item.icon className='text-muted-foreground size-4' />
                {item.title}
                {item.mark && <div className='bg-brand-blue-500 mr-2 h-2 w-2 rounded-full' />}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {submenu.options.map(option => (
                  <DropdownMenuItem className='flex items-center gap-2 px-2 py-1.5'>
                    {option.icon && <option.icon className='size-4' />}
                    {option.label}
                    {option.mark && <div className='bg-brand-blue-500 mr-2 h-2 w-2 rounded-full' />}
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
            {item.mark && <div className='bg-brand-blue-500 mr-2 h-2 w-2 rounded-full' />}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  );
}
