import { Bot } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../../../../shared/components/CollapsibleCard';
import { ConnectAiAssistantPromoActions } from '../../../../../../shared/components/ConnectAiAssistantPromoActions';

const AI_ASSISTANT_CARD_STORAGE_PREFIX = 'ai-assistant-destination-card';

interface AiAssistantDestinationCardProps {
  /** Current Data Mart's id — scopes the collapsed-state persistence to this Data Mart. */
  dataMartId: string;
}

/**
 * Promo card shown alongside real DestinationCards on a Data Mart's Destinations
 * tab. Visually matches DestinationCard (same CollapsibleCard shell) but isn't
 * backed by a DataDestination — it points analysts to the MCP connection
 * (Claude/ChatGPT) as another way to consume this Data Mart's published data.
 * Collapsible like a real card; the collapsed state persists per Data Mart (like
 * real destination cards persist per destination), so folding it on one Data
 * Mart doesn't hide the promo on every other one.
 */
export function AiAssistantDestinationCard({ dataMartId }: AiAssistantDestinationCardProps) {
  return (
    <div className='flex flex-col gap-0.5' data-testid='aiAssistantDestCard'>
      <CollapsibleCard
        name={`${AI_ASSISTANT_CARD_STORAGE_PREFIX}-${dataMartId}`}
        collapsible
        defaultCollapsed={false}
      >
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={Bot} subtitle='Claude, ChatGPT'>
            AI Assistants
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>

        <CollapsibleCardContent>
          <div className='flex flex-col items-center gap-3 text-center'>
            <p className='text-muted-foreground max-w-xl text-sm'>
              Ask in plain language and get answers pulled straight from your Data Marts, not
              guesses. Connect via Claude or ChatGPT — whichever your team already uses.
            </p>
            <ConnectAiAssistantPromoActions
              align='center'
              utmMedium='dm_page_destinations_tab'
              utmCampaign='ai_assistant_card'
            />
          </div>
        </CollapsibleCardContent>

        <CollapsibleCardFooter />
      </CollapsibleCard>
    </div>
  );
}
