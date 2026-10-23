import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { cn } from '@owox/ui/lib/utils';
import { Check, ChevronDown, Copy, Globe, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { useClipboard } from '../../../../hooks/useClipboard';
import { ChatGPTIcon, ClaudeIcon } from '../../../../shared/icons';
import {
  buildDataMartSetupPrompt,
  type DataMartSetupPromptOptions,
} from '../utils/data-mart-setup-prompt';

export function DataMartSetupAssistantActions({
  className,
  ...props
}: DataMartSetupPromptOptions & { className?: string }) {
  const prompt = buildDataMartSetupPrompt(props);
  const encodedPrompt = encodeURIComponent(prompt);
  const { copiedSection, copyToClipboard } = useClipboard();
  const copied = copiedSection === 'setup-prompt';
  const assistants = [
    {
      name: 'ChatGPT',
      Icon: ChatGPTIcon,
      browserUrl: `https://chatgpt.com/?q=${encodedPrompt}`,
      desktopUrl: `codex://new?prompt=${encodedPrompt}`,
    },
    {
      name: 'Claude',
      Icon: ClaudeIcon,
      browserUrl: `https://claude.ai/new?q=${encodedPrompt}`,
      desktopUrl: `claude://claude.ai/new?q=${encodedPrompt}`,
    },
  ];

  const copyPrompt = async () => {
    if (!(await copyToClipboard(prompt, 'setup-prompt'))) {
      toast.error('Could not copy the prompt. Please try again.');
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {assistants.map(({ name, Icon, browserUrl, desktopUrl }) => (
        <DropdownMenu key={name}>
          <DropdownMenuTrigger asChild>
            <Button size='sm' variant='outline' type='button'>
              <Icon size={16} />
              {name}
              <ChevronDown className='size-3' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' data-ignore-outside-dismiss>
            <DropdownMenuItem asChild>
              <a href={browserUrl} target='_blank' rel='noopener noreferrer'>
                <Globe className='size-4' />
                Open in browser
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={desktopUrl}>
                <Monitor className='size-4' />
                Open in desktop app
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
      <Button
        size='sm'
        variant='ghost'
        type='button'
        aria-label={copied ? 'Prompt copied' : 'Copy prompt'}
        title={copied ? 'Prompt copied' : 'Copy prompt'}
        onClick={() => void copyPrompt()}
      >
        {copied ? <Check className='size-4' /> : <Copy className='size-4' />}
      </Button>
    </div>
  );
}
