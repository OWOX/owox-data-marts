import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@owox/ui/components/tooltip';

const MCP_SETUP_GUIDE_URL = 'https://docs.owox.com/docs/getting-started/setup-guide/mcp/';

/**
 * Compact hint shown under the Reports empty state. Points analysts to the MCP
 * connection so they can query their Data Marts from Claude or ChatGPT before
 * any report exists. Visual style mirrors InviteTeammatesCard's `card` variant.
 * Purely presentational; both links open the MCP setup guide in a new tab.
 */
export function AiAssistantHintCard() {
  return (
    <div className='bg-muted/50 text-muted-foreground dark:text-muted-foreground/75 flex items-center justify-between gap-4 rounded-md border-b border-gray-200 px-4 py-3 text-sm dark:border-white/2 dark:bg-white/2'>
      <div className='flex min-w-0 items-center gap-2'>
        <a
          href={MCP_SETUP_GUIDE_URL}
          target='_blank'
          rel='noopener noreferrer'
          className='hover:text-foreground flex min-w-0 items-center gap-1.5 font-medium transition-colors hover:underline'
        >
          <span className='truncate underline'>Ask your data in Claude or ChatGPT</span>
        </a>
        <span className='text-muted-foreground/75 dark:text-muted-foreground/50 hidden truncate lg:inline'>
          — set up the MCP connection
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={MCP_SETUP_GUIDE_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='text-muted-foreground/75 dark:text-muted-foreground/50 hover:text-foreground'
            aria-label='MCP setup guide'
          >
            <HelpCircle className='h-4 w-4 shrink-0' />
          </a>
        </TooltipTrigger>
        <TooltipContent>
          <p>MCP setup guide</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
