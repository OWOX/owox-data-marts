import { DropdownMenuTrigger } from '@owox/ui/components/dropdown-menu';
import { ChevronDown, MessageCircleQuestionIcon } from 'lucide-react';

interface HelpMenuTriggerProps {
  isOpen: boolean;
}

export function HelpMenuTrigger({ isOpen }: HelpMenuTriggerProps) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        type='button'
        data-slot='dropdown-menu-trigger'
        data-sidebar='menu-button'
        data-size='lg'
        data-active={isOpen ? 'true' : 'false'}
        aria-haspopup='menu'
        aria-expanded={isOpen}
        data-state={isOpen ? 'open' : 'closed'}
        className={`peer/menu-button ring-sidebar-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0`}
      >
        <div className='text-foreground flex aspect-square size-8 items-center justify-center rounded-md border bg-white dark:bg-white/10'>
          <MessageCircleQuestionIcon
            className='text-muted-foreground'
            size={18}
            strokeWidth={1.5}
          />
        </div>

        <div className='grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden'>
          <span className='truncate font-medium'>Help</span>
          <span className='text-muted-foreground hidden truncate text-xs'>Chat, Docs, Videos</span>
        </div>

        <ChevronDown
          className={`ml-auto size-4 transition-transform duration-200 group-data-[collapsible=icon]:hidden ${
            isOpen ? '-rotate-90' : ''
          }`}
        />
      </button>
    </DropdownMenuTrigger>
  );
}
