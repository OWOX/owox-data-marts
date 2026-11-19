import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Sparkles } from 'lucide-react';
import { useIsMcpPromoAvailable } from '../hooks';
import { AiAssistantHandoff } from './AiAssistantHandoff';

export function SidebarConnectAiAssistant() {
  const available = useIsMcpPromoAvailable();
  if (!available) return null;

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
          <Popover>
            <PopoverTrigger asChild>
              <button
                type='button'
                aria-label='Connect AI assistant'
                data-sidebar='menu-button'
                data-size='lg'
                className='peer/menu-button ring-sidebar-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0'
              >
                <div className='text-foreground flex aspect-square size-8 items-center justify-center rounded-md border bg-white dark:bg-white/10'>
                  <Sparkles className='text-muted-foreground' size={18} strokeWidth={1.5} />
                </div>

                <div className='grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden'>
                  <span className='truncate font-medium'>Connect AI assistant</span>
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side='right'
              align='end'
              className='w-96'
              aria-label='Connect your AI assistant'
            >
              <AiAssistantHandoff
                mode='connector'
                placement='sidebar_connect'
                mcpPart='both'
                title='Connect your AI assistant'
                subtitle='Ask your Data Marts and set up OWOX from Claude or ChatGPT.'
              />
            </PopoverContent>
          </Popover>
        </li>
      </ul>
    </div>
  );
}
