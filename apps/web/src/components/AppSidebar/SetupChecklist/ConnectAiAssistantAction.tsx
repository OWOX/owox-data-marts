import { ClaudeIcon, ChatGPTIcon } from '../../../shared/icons';
import { Button } from '@owox/ui/components/button';

import {
  CHATGPT_PLUGIN_URL,
  CLAUDE_DIRECTORY_URL,
  type McpPromoAction,
  setupGuideUrl,
  trackMcpPromoClicked,
  useMcpPromoShown,
} from '../../../features/mcp-promo';

const PROMO_CTX = { placement: 'setup_checklist', mcpPart: 'both', mode: 'connector' } as const;

interface ConnectAiAssistantActionProps {
  onClick?: () => void;
}

export function ConnectAiAssistantAction({ onClick }: ConnectAiAssistantActionProps) {
  useMcpPromoShown(PROMO_CTX, true);
  const handleClick = (action: McpPromoAction) => () => {
    trackMcpPromoClicked({ ...PROMO_CTX, action });
    if (action !== 'docs') onClick?.();
  };
  return (
    <div className='mt-1 flex flex-col gap-2 text-center'>
      <div className='flex gap-2'>
        <Button size='sm' variant='outline' className='flex-1' asChild>
          <a
            href={CLAUDE_DIRECTORY_URL}
            target='_blank'
            rel='noopener noreferrer'
            onClick={handleClick('claude')}
          >
            <ClaudeIcon size={16} />
            Claude
          </a>
        </Button>
        <Button size='sm' variant='outline' className='flex-1' asChild>
          <a
            href={CHATGPT_PLUGIN_URL}
            target='_blank'
            rel='noopener noreferrer'
            onClick={handleClick('chatgpt')}
          >
            <ChatGPTIcon size={16} />
            ChatGPT
          </a>
        </Button>
      </div>
      <a
        href={setupGuideUrl(PROMO_CTX.placement)}
        target='_blank'
        rel='noopener noreferrer'
        onClick={handleClick('docs')}
        className='text-muted-foreground hover:text-foreground text-xs underline underline-offset-2'
      >
        How to set up the MCP connection
      </a>
    </div>
  );
}
