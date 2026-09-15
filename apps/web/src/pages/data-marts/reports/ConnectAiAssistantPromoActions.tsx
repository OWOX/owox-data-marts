import { Button } from '@owox/ui/components/button';
import { ChatGPTIcon, ClaudeIcon } from '../../../shared/icons';
import { cn } from '@owox/ui/lib/utils';

const CLAUDE_DIRECTORY_URL = 'https://claude.ai/directory/owox-data-marts';
const CHATGPT_PLUGIN_URL =
  'https://chatgpt.com/plugins/plugin_asdk_app_6a3e81be8f8481918e1e2cd1d7ea09c4';
const MCP_SETUP_GUIDE_URL = 'https://docs.owox.com/docs/getting-started/setup-guide/mcp/';

interface ConnectAiAssistantPromoActionsProps {
  /**
   * Horizontal alignment of the buttons/link once they sit on one row (xl+).
   * 'start' (default) matches the two-column promo layout (Reports page,
   * empty-state promo tab); 'center' suits a full-width, single-column host.
   */
  align?: 'start' | 'center';
}

/**
 * Actions for the "Get answers in Claude or ChatGPT" promo block: outline
 * buttons (icon + label) linking to the OWOX Data Marts connector in Claude
 * and ChatGPT, wrapping onto a second line on narrow viewports, plus a link
 * to the MCP setup guide. Every link opens in a new tab. Purely
 * presentational, no side effects.
 */
export function ConnectAiAssistantPromoActions({
  align = 'start',
}: ConnectAiAssistantPromoActionsProps = {}) {
  const xlJustifyClass = align === 'center' ? 'xl:justify-center' : 'xl:justify-start';

  return (
    <div className='flex flex-col items-start gap-3'>
      <div
        className={cn(
          'flex w-full flex-col justify-center gap-2 xl:flex-row xl:gap-4',
          xlJustifyClass
        )}
      >
        <Button size='sm' variant='outline' asChild className='xl:min-w-[140px]'>
          <a href={CLAUDE_DIRECTORY_URL} target='_blank' rel='noopener noreferrer'>
            <ClaudeIcon size={16} />
            Claude
          </a>
        </Button>
        <Button size='sm' variant='outline' asChild className='xl:min-w-[140px]'>
          <a href={CHATGPT_PLUGIN_URL} target='_blank' rel='noopener noreferrer'>
            <ChatGPTIcon size={16} />
            ChatGPT
          </a>
        </Button>
      </div>
      <div className={cn('flex w-full justify-center', xlJustifyClass)}>
        <a
          href={MCP_SETUP_GUIDE_URL}
          target='_blank'
          rel='noopener noreferrer'
          className='text-muted-foreground hover:text-foreground text-xs underline underline-offset-2'
        >
          How to set up the MCP connection
        </a>
      </div>
    </div>
  );
}
