import { useState, type ReactNode, type RefObject } from 'react';
import { GraduationCap, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@owox/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { cn } from '@owox/ui/lib/utils';
import { useClipboard } from '../../../hooks/useClipboard';
import { ChatGPTIcon, ClaudeIcon } from '../../../shared/icons';
import { trackMcpPromoClicked, type McpPart, type McpPromoPlacement } from '../analytics';
import { CHATGPT_PLUGIN_URL, CLAUDE_DIRECTORY_URL, MCP_SHARED_SERVER_URL } from '../constants';
import { useIsMcpPromoAvailable, useMcpPromoShownWhenExpanded } from '../hooks';
import { chatGptNewChatUrl, claudeNewChatUrl, setupGuideUrl } from '../prompts';

type HandoffProps = {
  placement: McpPromoPlacement;
  mcpPart: McpPart;
  title?: string;
  subtitle?: string;
  /**
   * `dialog`: tabs for Claude and ChatGPT and the full text. The dialog's opener sends shown.
   * `block`: the open buttons and a small copy button; the text shows only after a failed copy.
   */
  layout?: 'grid' | 'dialog' | 'block';
  /** Kept by a parent that outlives this block, so a remount does not send shown again. */
  shownRef?: RefObject<boolean>;
} & ({ mode: 'prompt'; prompt: string } | { mode: 'connector' });

const COPY_FAILED = 'Could not copy. Select the text and copy it.';

const cellClass =
  'hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring flex h-10 items-center gap-2 px-3 text-left text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset';

export function AiAssistantHandoff(props: HandoffProps) {
  const { placement, mcpPart, mode, title, subtitle, layout = 'grid', shownRef } = props;
  const available = useIsMcpPromoAvailable();
  const { copiedSection, copyToClipboard } = useClipboard();
  const [copyFailed, setCopyFailed] = useState(false);
  const isDialog = layout === 'dialog';
  useMcpPromoShownWhenExpanded({ placement, mcpPart, mode }, available && !isDialog, shownRef);

  if (!available) return null;

  const isPrompt = props.mode === 'prompt';
  const text = isPrompt ? props.prompt : MCP_SHARED_SERVER_URL;
  const claudeHref = isPrompt ? claudeNewChatUrl(text) : CLAUDE_DIRECTORY_URL;
  const chatGptHref = isPrompt ? chatGptNewChatUrl(text) : CHATGPT_PLUGIN_URL;
  const claudeLabel = isPrompt ? 'Open in Claude' : 'Add to Claude';
  const chatGptLabel = isPrompt ? 'Open in ChatGPT' : 'Add to ChatGPT';
  const track = (action: 'claude' | 'chatgpt' | 'copy' | 'docs') => {
    trackMcpPromoClicked({ placement, mcpPart, mode, action });
  };

  const copy = async () => {
    track('copy');
    const copiedNow = await copyToClipboard(text, 'mcp-promo');
    setCopyFailed(!copiedNow);
    // A sheet hides the toast from screen readers; the status below still announces it.
    if (!copiedNow) toast.error(COPY_FAILED);
  };

  const link = (
    href: string,
    action: 'claude' | 'chatgpt' | 'docs',
    content: ReactNode,
    className?: string
  ) => (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className={className}
      onClick={() => {
        track(action);
      }}
    >
      {content}
    </a>
  );

  const copied = copiedSection === 'mcp-promo';
  const copyContent = (
    <>
      {copied ? <Check className='size-4' /> : <Copy className='size-4' />}
      {copied ? 'Copied' : isPrompt ? 'Copy prompt' : 'Copy MCP URL'}
    </>
  );

  const status = (
    <span role='status' className='sr-only'>
      {copied ? 'Copied to clipboard' : copyFailed ? COPY_FAILED : ''}
    </span>
  );

  const cellContent = (icon: ReactNode, label: string) => (
    <>
      {icon}
      {label}
    </>
  );

  if (layout === 'block') {
    return (
      <div className='flex min-w-0 flex-col gap-2'>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' className='flex-1' asChild>
            {link(claudeHref, 'claude', cellContent(<ClaudeIcon size={16} />, claudeLabel))}
          </Button>
          <Button variant='outline' className='flex-1' asChild>
            {link(chatGptHref, 'chatgpt', cellContent(<ChatGPTIcon size={16} />, chatGptLabel))}
          </Button>
        </div>
        <Button
          variant='ghost'
          size='sm'
          type='button'
          className='text-muted-foreground self-center'
          onClick={() => void copy()}
        >
          {copyContent}
        </Button>
        {copyFailed && (
          <div className='bg-muted max-h-40 overflow-y-auto rounded-sm px-3 py-2'>
            <p className='text-muted-foreground font-mono text-xs break-words'>{text}</p>
          </div>
        )}
        {status}
      </div>
    );
  }

  if (isDialog) {
    const tab = (value: 'claude' | 'chatgpt', href: string, label: string) => (
      <TabsContent value={value} className='flex min-w-0 flex-col gap-3'>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' asChild>
            {link(href, value, label)}
          </Button>
          <Button variant='outline' type='button' onClick={() => void copy()}>
            {copyContent}
          </Button>
        </div>
        <div className='bg-muted max-h-64 overflow-y-auto rounded-sm px-3 py-2'>
          <p className='text-muted-foreground font-mono text-xs break-words'>{text}</p>
        </div>
      </TabsContent>
    );
    return (
      <div className='flex min-w-0 flex-col gap-3'>
        <Tabs defaultValue='claude' className='gap-3'>
          <TabsList>
            <TabsTrigger value='claude' className='px-3'>
              <ClaudeIcon size={16} />
              Claude
            </TabsTrigger>
            <TabsTrigger value='chatgpt' className='px-3'>
              <ChatGPTIcon size={16} />
              ChatGPT
            </TabsTrigger>
          </TabsList>
          {tab('claude', claudeHref, claudeLabel)}
          {tab('chatgpt', chatGptHref, chatGptLabel)}
        </Tabs>
        {link(
          setupGuideUrl(placement),
          'docs',
          <>
            <GraduationCap className='size-4' />
            MCP setup guide
          </>,
          'text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-xs font-medium transition-colors hover:underline'
        )}
        {status}
      </div>
    );
  }

  return (
    <div className='w-full'>
      {title && <p className='mb-1 text-sm font-medium'>{title}</p>}
      {subtitle && <p className='text-muted-foreground mb-2.5 text-xs'>{subtitle}</p>}
      <div className='border-border overflow-hidden rounded-lg border'>
        <div className='[&>*:nth-child(-n+2)]:border-border [&>*:nth-child(odd)]:border-border grid grid-cols-2 [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(odd)]:border-r'>
          {link(
            claudeHref,
            'claude',
            cellContent(<ClaudeIcon size={16} />, claudeLabel),
            cellClass
          )}
          {link(
            setupGuideUrl(placement),
            'docs',
            cellContent(<GraduationCap className='size-4' />, 'MCP setup guide'),
            cellClass
          )}
          {link(
            chatGptHref,
            'chatgpt',
            cellContent(<ChatGPTIcon size={16} />, chatGptLabel),
            cellClass
          )}
          <button type='button' className={cellClass} onClick={() => void copy()}>
            {copyContent}
          </button>
        </div>
        <div className='border-border border-t px-3 py-3'>
          {/* After a failed copy the user selects the text, so all of it shows. */}
          <p
            className={cn(
              'text-muted-foreground font-mono text-xs break-words',
              !copyFailed && 'line-clamp-3'
            )}
          >
            {text}
          </p>
        </div>
      </div>
      {status}
    </div>
  );
}
