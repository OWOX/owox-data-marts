import { ClaudeIcon, ChatGPTIcon } from '../../../shared/icons';
import { Button } from '@owox/ui/components/button';

const CLAUDE_DIRECTORY_URL = 'https://claude.ai/directory/owox-data-marts';
const CHATGPT_PLUGIN_URL =
  'https://chatgpt.com/plugins/plugin_asdk_app_6a3e81be8f8481918e1e2cd1d7ea09c4';
const SETUP_GUIDE_URL = 'https://docs.owox.com/docs/getting-started/setup-guide/mcp/';

interface ConnectAiAssistantActionProps {
  onClick?: () => void;
}

export function ConnectAiAssistantAction({ onClick }: ConnectAiAssistantActionProps) {
  return (
    <div className='mt-1 flex flex-col gap-2 text-center'>
      <div className='flex gap-2'>
        <Button size='sm' variant='outline' className='flex-1' asChild>
          <a
            href={CLAUDE_DIRECTORY_URL}
            target='_blank'
            rel='noopener noreferrer'
            onClick={onClick}
          >
            <ClaudeIcon size={16} />
            Claude
          </a>
        </Button>
        <Button size='sm' variant='outline' className='flex-1' asChild>
          <a href={CHATGPT_PLUGIN_URL} target='_blank' rel='noopener noreferrer' onClick={onClick}>
            <ChatGPTIcon size={16} />
            ChatGPT
          </a>
        </Button>
      </div>
      <a
        href={SETUP_GUIDE_URL}
        target='_blank'
        rel='noopener noreferrer'
        className='text-muted-foreground hover:text-foreground text-xs underline underline-offset-2'
      >
        How to set up the MCP connection
      </a>
    </div>
  );
}
