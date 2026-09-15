import { Bot } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../../../../shared/components/CollapsibleCard';
import { ConnectAiAssistantPromoActions } from '../../../../../../pages/data-marts/reports/ConnectAiAssistantPromoActions';

const AI_ASSISTANT_CARD_STORAGE_NAME = 'ai-assistant-destination-card';

/**
 * Promo card shown alongside real DestinationCards on a Data Mart's Destinations
 * tab. Visually matches DestinationCard (same CollapsibleCard shell) but isn't
 * backed by a DataDestination — it points analysts to the MCP connection
 * (Claude/ChatGPT) as another way to consume this Data Mart's published data.
 * Collapsible like a real card, so a user not interested can fold it once; the
 * choice persists per-browser in localStorage under a fixed name shared across
 * all Data Marts.
 */
export function AiAssistantDestinationCard() {
  return (
    <div className='flex flex-col gap-0.5' data-testid='aiAssistantDestCard'>
      <CollapsibleCard name={AI_ASSISTANT_CARD_STORAGE_NAME} collapsible defaultCollapsed={false}>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={Bot} subtitle='Claude, ChatGPT'>
            AI Assistants
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>

        <CollapsibleCardContent>
          <div className='flex flex-col items-center gap-3 pb-8 text-center'>
            <p className='text-muted-foreground max-w-xl text-sm'>
              Ask in plain language and get answers pulled straight from your Data Marts, not
              guesses. Connect via Claude or ChatGPT — whichever your team already uses.
            </p>
            <ConnectAiAssistantPromoActions align='center' />
          </div>
        </CollapsibleCardContent>
      </CollapsibleCard>
    </div>
  );
}
