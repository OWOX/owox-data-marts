import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@owox/ui/components/dropdown-menu';
import type { HelpMenuItem } from './types';

interface HelpMenuContentProps {
  items: HelpMenuItem[];
  onClose?: () => void;
}

export function HelpMenuContent({ items, onClose }: HelpMenuContentProps) {
  return (
    <DropdownMenuContent align='end' side='right' className='w-56'>
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <DropdownMenuSeparator key={`sep-${String(index)}`} />;
        }
        const Icon = item.icon;

        if (item.type === 'submenu') {
          const { submenu } = item;

          return (
            <DropdownMenuSub key={`submenu-${item.title}-${String(index)}`}>
              <DropdownMenuSubTrigger className='flex items-center gap-2'>
                <Icon className='text-muted-foreground size-4' />
                {item.title}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {submenu.options.map((option, optIndex) => (
                  <DropdownMenuItem
                    key={`submenu-${item.title}-opt-${String(optIndex)}`}
                    onClick={() => {
                      option.onClick?.();
                      onClose?.();
                    }}
                  >
                    {option.icon && <option.icon className='size-4' />}
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        }

        return (
          <DropdownMenuItem
            key={`item-${item.title}-${String(index)}`}
            onClick={() => {
              item.onClick?.();
              onClose?.();
            }}
            asChild={!!item.href}
          >
            {item.href ? (
              <a href={item.href} target='_blank' rel='noopener noreferrer'>
                <Icon className='size-4' />
                {item.title}
              </a>
            ) : (
              <>
                <Icon className='size-4' />
                {item.title}
              </>
            )}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  );
}
