import { Button } from '@owox/ui/components/button';
import { CalendarClock, FileText, History, Sparkles } from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { storageService } from '../../../../services';

// Set to track currently visible promo toasts
const activePromoToasts = new Set<string>();

// Prefix for storing globally shown promos (per user, across all data marts)
const SHOW_ONCE_KEY_PREFIX = 'promo_shown_once_';

/**
 * Next-step promo types shown after key data mart actions
 */
export enum PromoStep {
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
      isInsightsEnabled,
      duration = Infinity,
      showOnce = false,
    }: ShowPromoOptions) => {
      // Skip if this promo was already shown once globally
      if (showOnce && isPromoShownOnce(step)) return;

      // Single ID per data mart to prevent multiple toasts for the same data mart
      const toastId = `promo_${dataMartId}`;

      // If a promo toast is already visible for this data mart — skip entirely
      if (activePromoToasts.has(toastId)) return;

      // Mark promo as shown to prevent future displays (one-time promo)
      if (showOnce) markPromoAsShownOnce(step);

      // Common toast lifecycle callbacks
      const onDismiss = () => activePromoToasts.delete(toastId);
      const onAutoClose = () => activePromoToasts.delete(toastId);

      // Mark as active BEFORE calling toast()
      activePromoToasts.add(toastId);

      switch (step) {
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
    activePromoToasts.forEach(toastId => {
      toast.dismiss(toastId);
    });
    activePromoToasts.clear();
  }, []);

  return { showPromo, dismissAllPromos };
}
