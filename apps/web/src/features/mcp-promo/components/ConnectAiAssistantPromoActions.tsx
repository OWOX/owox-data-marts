import { Button } from '@owox/ui/components/button';
import { ChatGPTIcon, ClaudeIcon } from '../../../shared/icons';
import { cn } from '@owox/ui/lib/utils';

import { CHATGPT_PLUGIN_URL, CLAUDE_DIRECTORY_URL, MCP_SETUP_GUIDE_URL } from '../constants';
import { type McpPromoAction, type McpPromoEventContext, trackMcpPromoClicked } from '../analytics';
import { setupGuideUrl } from '../prompts';

interface ConnectAiAssistantPromoActionsProps {
  ctx: McpPromoEventContext;
  /**
   * Horizontal alignment of the buttons/link once they sit on one row (xl+).
   * 'start' (default) matches the two-column promo layout (Reports page,
   * empty-state promo tab); 'center' suits a full-width, single-column host.
   */
  align?: 'start' | 'center';
  /**
   * UTM medium/campaign appended to the MCP setup guide link, matching the
   * tagging convention used by the docs links next to this component. This
   * component renders at several placements (Reports page, empty-state promo
   * tab, Destinations tab), so without a placement-specific tag their clicks
   * are indistinguishable in analytics. Provide both or neither — omitting
   * them leaves the link untagged.
   */
  utmMedium?: string;
  utmCampaign?: string;
}

/**
 * Actions for the "Get answers in Claude or ChatGPT" promo block: outline
 * buttons (icon + label) linking to the OWOX Data Marts connector in Claude
 * and ChatGPT, wrapping onto a second line on narrow viewports, plus a link
 * to the MCP setup guide. Every link opens in a new tab.
 */
export function ConnectAiAssistantPromoActions({
  ctx,
  align = 'start',
  utmMedium,
  utmCampaign,
}: ConnectAiAssistantPromoActionsProps) {
  const xlJustifyClass = align === 'center' ? 'xl:justify-center' : 'xl:justify-start';
  const mcpSetupGuideUrl =
    utmMedium && utmCampaign
      ? setupGuideUrl(ctx.placement, { medium: utmMedium, campaign: utmCampaign })
      : MCP_SETUP_GUIDE_URL;

  const track = (action: McpPromoAction) => {
    trackMcpPromoClicked({ ...ctx, action });
  };

  return (
    <div className='flex flex-col items-start gap-3'>
      <div
        className={cn(
          'flex w-full flex-col justify-center gap-2 xl:flex-row xl:gap-4',
          xlJustifyClass
        )}
      >
        <Button size='sm' variant='outline' asChild className='xl:min-w-[140px]'>
          <a
            href={CLAUDE_DIRECTORY_URL}
            target='_blank'
            rel='noopener noreferrer'
            onClick={() => {
              track('claude');
            }}
          >
            <ClaudeIcon size={16} />
            Claude
          </a>
        </Button>
        <Button size='sm' variant='outline' asChild className='xl:min-w-[140px]'>
          <a
            href={CHATGPT_PLUGIN_URL}
            target='_blank'
            rel='noopener noreferrer'
            onClick={() => {
              track('chatgpt');
            }}
          >
            <ChatGPTIcon size={16} />
            ChatGPT
          </a>
        </Button>
      </div>
      <div className={cn('flex w-full justify-center', xlJustifyClass)}>
        <a
          href={mcpSetupGuideUrl}
          target='_blank'
          rel='noopener noreferrer'
          onClick={() => {
            track('docs');
          }}
          className='text-muted-foreground hover:text-foreground text-xs underline underline-offset-2'
        >
          How to set up the MCP connection
        </a>
      </div>
    </div>
  );
}
