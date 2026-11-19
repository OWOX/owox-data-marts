import { type RefObject, useRef } from 'react';
import { ChevronRight, ExternalLink, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@owox/ui/components/dialog';
import { cn } from '@owox/ui/lib/utils';
import { ChatGPTIcon, ClaudeIcon } from '../../../shared/icons';
import { type McpPromoEventContext, trackMcpPromoClicked } from '../analytics';
import {
  useIsMcpPromoAvailable,
  useIsMcpSetupPromoAvailable,
  useMcpPromoShownWhenExpanded,
} from '../hooks';
import { chatGptNewChatUrl, claudeNewChatUrl, type McpPromptPlacement } from '../prompts';
import { AiAssistantHandoff } from './AiAssistantHandoff';

interface McpPromoCardProps {
  placement: McpPromptPlacement;
  mcpPart: 'setup' | 'consumption';
  prompt: string;
  title: string;
  /**
   * `section`: one line under the Save / Cancel actions of a form.
   * `hint`: one sentence for a stuck user, inside a clickable card.
   */
  variant?: 'default' | 'section' | 'hint';
  /** Kept by a parent that outlives this card, so a remount does not send shown again. */
  shownRef?: RefObject<boolean>;
}

export function AiAssistantIcons({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const circle = cn(
    'bg-background flex items-center justify-center rounded-full border',
    size === 'lg' ? 'size-9' : 'size-6'
  );
  const iconSize = size === 'lg' ? 20 : 14;
  return (
    <span className='flex shrink-0 items-center' aria-hidden>
      <span className={circle}>
        <ClaudeIcon size={iconSize} />
      </span>
      <span className={cn(circle, size === 'lg' ? '-ml-2' : '-ml-1.5')}>
        <ChatGPTIcon size={iconSize} />
      </span>
    </span>
  );
}

function ChatLink({
  to,
  prompt,
  ctx,
}: {
  to: 'claude' | 'chatgpt';
  prompt: string;
  ctx: McpPromoEventContext;
}) {
  const isClaude = to === 'claude';
  const Icon = isClaude ? ClaudeIcon : ChatGPTIcon;
  return (
    <a
      href={isClaude ? claudeNewChatUrl(prompt) : chatGptNewChatUrl(prompt)}
      target='_blank'
      rel='noopener noreferrer'
      className='text-foreground inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline'
      onClick={event => {
        // The hint sits inside a clickable card that must not open.
        event.stopPropagation();
        trackMcpPromoClicked({ ...ctx, action: to });
      }}
    >
      <Icon size={14} />
      {isClaude ? 'Claude' : 'ChatGPT'}
      <span className='sr-only'> (opens in a new tab)</span>
    </a>
  );
}

export function McpPromoCard({
  placement,
  mcpPart,
  prompt,
  title,
  variant = 'default',
  shownRef,
}: McpPromoCardProps) {
  const ownShownRef = useRef(false);
  const isAvailable = useIsMcpPromoAvailable();
  const isSetupAvailable = useIsMcpSetupPromoAvailable();
  const visible = mcpPart === 'setup' ? isSetupAvailable : isAvailable;
  const ctx = { placement, mcpPart, mode: 'prompt' } as const;
  // A hint inside a collapsed card stays mounted but unseen: it sends shown when the card opens.
  useMcpPromoShownWhenExpanded(ctx, visible, shownRef ?? ownShownRef);
  if (!visible) return null;

  const externalIcon = <ExternalLink className='size-3 shrink-0' aria-hidden />;

  if (variant === 'section') {
    return (
      <div className='text-muted-foreground flex shrink-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 px-4 pb-3 text-sm'>
        <Sparkles className='size-4 shrink-0' aria-hidden />
        <span>{placement.endsWith('_maintain') ? 'Or change this in' : 'Or finish this in'}</span>
        <ChatLink to='claude' prompt={prompt} ctx={ctx} />
        <span aria-hidden>·</span>
        <ChatLink to='chatgpt' prompt={prompt} ctx={ctx} />
        {externalIcon}
      </div>
    );
  }

  if (variant === 'hint') {
    return (
      <p className='text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm'>
        Not sure what goes where? Let <ChatLink to='claude' prompt={prompt} ctx={ctx} /> or{' '}
        <ChatLink to='chatgpt' prompt={prompt} ctx={ctx} /> walk you through it {externalIcon}
      </p>
    );
  }

  return (
    <Dialog
      onOpenChange={open => {
        if (open) trackMcpPromoClicked({ ...ctx, action: 'details' });
      }}
    >
      <DialogTrigger asChild>
        <button
          type='button'
          className='group bg-muted/50 focus-visible:ring-ring/50 flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md border-b border-gray-200 px-4 py-3 text-left text-sm transition-colors outline-none hover:bg-gray-200/60 focus-visible:bg-gray-200/60 focus-visible:ring-[3px] dark:border-white/2 dark:bg-white/2 dark:hover:bg-white/8 dark:focus-visible:bg-white/8'
        >
          <AiAssistantIcons />
          {/* The subtitle wraps to a clipped second line when the row has no room for it. */}
          <span className='flex h-5 min-w-0 flex-1 flex-wrap gap-x-2 overflow-hidden'>
            <span className='truncate font-medium'>{title}</span>
            <span className='text-muted-foreground whitespace-nowrap'>
              Opens Claude or ChatGPT with a ready prompt
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5'
            aria-hidden
          />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Paste the prompt into a new chat, or open the chat with it.
          </DialogDescription>
        </DialogHeader>
        <AiAssistantHandoff
          layout='dialog'
          mode='prompt'
          prompt={prompt}
          placement={placement}
          mcpPart={mcpPart}
        />
      </DialogContent>
    </Dialog>
  );
}
