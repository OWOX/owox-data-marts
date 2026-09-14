import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAutoAdvanceTabs, useProjectRoute } from '../../../../../../shared/hooks';
import { PromoBlock } from '../../../../../../shared/components/PromoBlock/PromoBlock';
import { MicrosoftExcelIcon, GoogleSheetsIcon } from '../../../../../../shared/icons';
import { Button } from '@owox/ui/components/button';
import { ArchiveRestore, ChevronRight, Bot } from 'lucide-react';
import { InviteTeammatesCard } from '../../../../../../shared/components/InviteTeammatesCard';
import { ConnectAiAssistantPromoActions } from '../../../../../../pages/data-marts/reports/ConnectAiAssistantPromoActions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { cn } from '@owox/ui/lib/utils';

const DESTINATION_PROMO_TABS = ['sheets', 'excel', 'mcp'];
const TAB_CONTENT_FADE_MS = 300;

interface Props {
  variant?: 'default' | 'promo';
  onOpenCreateDestination?: () => void;
}

/**
 * Growing bottom-border indicator for the currently auto-advancing tab —
 * shows how much time is left before the next automatic switch. Hidden once
 * autoplay has stopped (manual selection, or reduced-motion preference).
 * Remounts (and so restarts) every time `show` flips back to `true`.
 */
function TabAutoAdvanceProgress({ show, durationMs }: { show: boolean; durationMs: number }) {
  if (!show) return null;

  return (
    <span
      aria-hidden='true'
      className='bg-foreground/25 absolute inset-x-0 bottom-0 h-0.5 origin-left [animation:tab-progress_linear_forwards] group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]'
      style={{ animationDuration: `${durationMs}ms` }}
    />
  );
}

export function EmptyDataMartDestinationsState({
  variant = 'default',
  onOpenCreateDestination,
}: Props) {
  const { scope } = useProjectRoute();
  const { value, onValueChange, pauseHandlers, isAutoPlaying, intervalMs } =
    useAutoAdvanceTabs(DESTINATION_PROMO_TABS);

  // Delay the actual tab switch by TAB_CONTENT_FADE_MS so the content can fade
  // out first — `displayedValue` (not `value`) drives what Tabs/TabsList/
  // TabsContent actually show, keeping the pill highlight, the progress bar
  // and the panel content all in sync throughout the transition.
  const [displayedValue, setDisplayedValue] = useState(value);
  const [isContentFadingOut, setIsContentFadingOut] = useState(false);

  useEffect(() => {
    if (value === displayedValue) return;
    setIsContentFadingOut(true);
    const timeoutId = setTimeout(() => {
      setDisplayedValue(value);
      setIsContentFadingOut(false);
    }, TAB_CONTENT_FADE_MS);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, displayedValue]);

  // Promo variant (show after data mart is published)
  if (variant === 'promo') {
    return (
      <div className='flex flex-col gap-0.5'>
        <Tabs
          value={displayedValue}
          onValueChange={onValueChange}
          className='group'
          {...pauseHandlers}
        >
          <TabsList className='border-background relative z-20 mx-auto -mb-6 border-b shadow-xs lg:border-b-0 lg:shadow-none'>
            <TabsTrigger value='sheets' className='relative flex-none overflow-hidden'>
              <GoogleSheetsIcon size={16} />
              Google Sheets
              <TabAutoAdvanceProgress
                show={displayedValue === 'sheets' && isAutoPlaying}
                durationMs={intervalMs}
              />
            </TabsTrigger>
            <TabsTrigger value='excel' className='relative flex-none overflow-hidden'>
              <MicrosoftExcelIcon size={16} />
              Microsoft Excel
              <TabAutoAdvanceProgress
                show={displayedValue === 'excel' && isAutoPlaying}
                durationMs={intervalMs}
              />
            </TabsTrigger>
            <TabsTrigger value='mcp' className='relative flex-none overflow-hidden'>
              <Bot size={16} />
              AI assistants
              <TabAutoAdvanceProgress
                show={displayedValue === 'mcp' && isAutoPlaying}
                durationMs={intervalMs}
              />
            </TabsTrigger>
          </TabsList>

          <div
            className={cn(
              'transition-opacity duration-300',
              isContentFadingOut ? 'opacity-0' : 'opacity-100'
            )}
          >
            <TabsContent value='sheets'>
              <PromoBlock
                icon={GoogleSheetsIcon}
                title='Analyze your data in&nbsp;Google Sheets'
                subtitle='Ready to start reporting?'
                description='Access live data directly in&nbsp;Sheets&nbsp;— choose columns and build reports without SQL or&nbsp;CSV&nbsp;exports.'
                primaryAction={{
                  label: 'Connect Google Sheets',
                  ...(onOpenCreateDestination
                    ? {
                        onClick: onOpenCreateDestination,
                      }
                    : {
                        href: scope('/data-destinations'),
                      }),
                }}
                secondaryAction={{
                  label: 'View all destinations',
                  href: scope('/data-destinations'),
                }}
              />
              <InviteTeammatesCard
                hint='— Ask colleagues to configure Google Sheets destination'
                docsLabel='Learn more about Google Sheets destination'
                docsHref='https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=empty_state'
              />
            </TabsContent>

            <TabsContent value='excel'>
              <PromoBlock
                icon={MicrosoftExcelIcon}
                title='Analyze your data in&nbsp;Microsoft Excel'
                subtitle='Ready to start reporting?'
                description='Access live data directly in&nbsp;Excel&nbsp;— choose columns and build reports without SQL or&nbsp;CSV&nbsp;exports.'
                primaryAction={{
                  label: 'Connect Microsoft Excel',
                  href: 'https://marketplace.microsoft.com/en-us/product/WA200011946',
                }}
                secondaryAction={{
                  label: 'Learn more',
                  href: 'https://docs.owox.com/docs/destinations/supported-destinations/microsoft-excel/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=empty_state',
                }}
              />
              <InviteTeammatesCard
                hint='— Ask colleagues to configure Microsoft Excel destination'
                docsLabel='Learn more about Microsoft Excel destination'
                docsHref='https://docs.owox.com/docs/destinations/supported-destinations/microsoft-excel/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=empty_state'
              />
            </TabsContent>

            <TabsContent value='mcp'>
              <PromoBlock
                icon={Bot}
                title='Get answers in Claude or ChatGPT'
                subtitle='Ready to start reporting?'
                description='Ask in plain language and get answers pulled straight from your Data Marts, not guesses. Connect via Claude or ChatGPT — whichever your team already uses.'
                actions={<ConnectAiAssistantPromoActions />}
              />
              <InviteTeammatesCard
                hint='— Ask colleagues to configure MCP connection'
                docsLabel='Learn more about MCP connection'
                docsHref='https://docs.owox.com/docs/getting-started/setup-guide/mcp/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=empty_state'
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    );
  }

  // Default empty state (show before data mart is published)
  return (
    <div className='flex flex-col gap-0.5'>
      <div className='dm-card'>
        <div className='dm-empty-state'>
          <ArchiveRestore className='dm-empty-state-ico' strokeWidth={1} />

          <h2 className='dm-empty-state-title'>Google Sheets, Data Studio, Email… and friends!</h2>

          <p className='dm-empty-state-subtitle'>
            To turn data into reports using your favorite tools, create a Destination first.
          </p>

          <Button variant='outline' asChild>
            <Link to={scope('/data-destinations')} className='flex items-center gap-1'>
              Go to Destinations
              <ChevronRight className='h-4 w-4' />
            </Link>
          </Button>
        </div>
      </div>
      <InviteTeammatesCard
        hint='— Not sure which destination to connect? Ask someone with access to help you'
        docsLabel='Learn more about Google Sheets destination'
        docsHref='https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/?utm_source=owox_data_marts&utm_medium=dm_page_destinations_tab&utm_campaign=empty_state'
      />
    </div>
  );
}
