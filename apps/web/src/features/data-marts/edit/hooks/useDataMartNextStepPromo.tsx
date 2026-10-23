import { Button } from '@owox/ui/components/button';
import { CalendarClock, FileText, History, Sparkles } from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { storageService } from '../../../../services';
import { DataMartSetupAssistantActions } from '../../shared/components/DataMartSetupAssistantActions';

// Track currently visible promo toasts and the step they promote.
const activePromoToasts = new Map<string, PromoStep>();

// Prefix for storing globally shown promos (per user, across all data marts)
const SHOW_ONCE_KEY_PREFIX = 'promo_shown_once_';

/**
 * Next-step promo types shown after key data mart actions
 */
export enum PromoStep {
  SETUP_DATA = 'setup_data',
  /** Promote scheduling data: create scheduled trigger */
  SCHEDULE_DATA = 'schedule_data',
  /** Promote using data: create insights or reports */
  USE_DATA = 'use_data',
}

function getShownOnceKey(step: PromoStep): string {
  return `${SHOW_ONCE_KEY_PREFIX}${step}`;
}

/** Returns true if the promo was already shown once globally (across all data marts) */
function isPromoShownOnce(step: PromoStep): boolean {
  return storageService.get(getShownOnceKey(step), 'boolean') === true;
}

/** Marks the promo as shown globally so it will never appear again for this user */
function markPromoAsShownOnce(step: PromoStep): void {
  storageService.set(getShownOnceKey(step), true);
}

interface ShowPromoOptions {
  /** The step to promote */
  step: PromoStep;
  /** Project ID for building URLs */
  projectId: string;
  /** Data mart ID for building URLs */
  dataMartId: string;
  mcpServerUrl?: string;
  /** Whether insights feature is enabled */
  isInsightsEnabled?: boolean;
  /** Toast display duration in ms. Defaults to Infinity */
  duration?: number;
  /** When true, the promo is shown only once globally (across all data marts) */
  showOnce?: boolean;
}

/**
 * Hook for showing next step promotion toasts after data mart actions
 */
export function useDataMartNextStepPromo() {
  const showPromo = useCallback(
    ({
      step,
      projectId,
      dataMartId,
      mcpServerUrl,
      isInsightsEnabled,
      duration = Infinity,
      showOnce = false,
    }: ShowPromoOptions) => {
      // Single ID per data mart to prevent multiple toasts for the same data mart
      const toastId = `promo_${dataMartId}`;
      const replacesSetupPromo =
        activePromoToasts.get(toastId) === PromoStep.SETUP_DATA && step !== PromoStep.SETUP_DATA;

      if (showOnce && isPromoShownOnce(step)) {
        if (replacesSetupPromo) {
          activePromoToasts.delete(toastId);
          toast.dismiss(toastId);
        }
        return;
      }

      // Publication supersedes the draft's setup promo.
      if (activePromoToasts.has(toastId) && !replacesSetupPromo) return;

      // Mark promo as shown to prevent future displays (one-time promo)
      if (showOnce) markPromoAsShownOnce(step);

      // Common toast lifecycle callbacks
      const onDismiss = () => {
        if (activePromoToasts.get(toastId) === step) activePromoToasts.delete(toastId);
      };
      const onAutoClose = onDismiss;

      // Mark as active BEFORE calling toast()
      activePromoToasts.set(toastId, step);

      switch (step) {
        case PromoStep.SETUP_DATA:
          toast(
            <div className='text-foreground text-sm'>
              You can continue setup with an AI assistant
            </div>,
            {
              id: toastId,
              closeButton: true,
              onDismiss,
              onAutoClose,
              description: (
                <div className='mt-2 space-y-3'>
                  <p>ChatGPT or Claude can help you configure this draft.</p>
                  <DataMartSetupAssistantActions
                    projectId={projectId}
                    dataMartId={dataMartId}
                    mcpServerUrl={mcpServerUrl}
                  />
                </div>
              ),
              duration,
            }
          );
          break;

        case PromoStep.SCHEDULE_DATA:
          toast(<div className='text-foreground text-sm'>Keep your data fresh automatically</div>, {
            id: toastId,
            closeButton: true,
            onDismiss,
            onAutoClose,
            description: (
              <div className='mt-2 flex gap-2'>
                <Button size='sm' variant='outline' asChild onClick={() => toast.dismiss(toastId)}>
                  <Link to={`/ui/${projectId}/data-marts/${dataMartId}/triggers`}>
                    <CalendarClock className='h-4 w-4' />
                    Schedule Updates
                  </Link>
                </Button>
                <Button size='sm' variant='ghost' asChild onClick={() => toast.dismiss(toastId)}>
                  <Link to={`/ui/${projectId}/data-marts/${dataMartId}/run-history`}>
                    <History className='h-4 w-4' />
                    View Run History
                  </Link>
                </Button>
              </div>
            ),
            duration,
          });
          break;

        case PromoStep.USE_DATA:
          toast(<div className='text-foreground text-sm'>Enable your data</div>, {
            id: toastId,
            closeButton: true,
            onDismiss,
            onAutoClose,
            description: (
              <div className='mt-2 flex gap-2'>
                {isInsightsEnabled && (
                  <Button
                    size='sm'
                    variant='outline'
                    asChild
                    onClick={() => toast.dismiss(toastId)}
                  >
                    <Link to={`/ui/${projectId}/data-marts/${dataMartId}/insights-v2`}>
                      <Sparkles className='h-4 w-4' />
                      Create Insights…
                    </Link>
                  </Button>
                )}

                <Button
                  size='sm'
                  variant={isInsightsEnabled ? 'ghost' : 'outline'}
                  asChild
                  onClick={() => toast.dismiss(toastId)}
                >
                  <Link to={`/ui/${projectId}/data-marts/${dataMartId}/reports`}>
                    <FileText className='h-4 w-4' />
                    Create Report…
                  </Link>
                </Button>
              </div>
            ),
            duration,
          });
          break;
      }
    },
    []
  );

  // Dismiss all currently visible promo toasts
  const dismissAllPromos = useCallback(() => {
    activePromoToasts.forEach((_step, toastId) => {
      toast.dismiss(toastId);
    });
    activePromoToasts.clear();
  }, []);

  return { showPromo, dismissAllPromos };
}
