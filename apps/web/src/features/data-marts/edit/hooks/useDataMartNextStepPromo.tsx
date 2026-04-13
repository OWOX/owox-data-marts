import { Button } from '@owox/ui/components/button';
import { CalendarClock, FileText, Play, Sparkles } from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { storageService } from '../../../../services';

// Set to track currently visible promo toasts
const activePromoToasts = new Set<string>();

const SUPPRESSION_KEY_PREFIX = 'promo_suppressed_';

/**
 * Enum for next step promo types
 */
export enum PromoStep {
  /** Promote loading data: run manually or create scheduled trigger */
  LOAD_DATA = 'load_data',
  /** Promote using data: create insights or reports */
  USE_DATA = 'use_data',
}

function getSuppressionKey(step: PromoStep): string {
  return `${SUPPRESSION_KEY_PREFIX}${step}`;
}

/** Returns true if the promo has been shown and should not appear again */
function isPromoSuppressed(step: PromoStep): boolean {
  return storageService.get(getSuppressionKey(step), 'boolean') === true;
}

/** Suppress the promo permanently */
function suppressPromo(step: PromoStep): void {
  storageService.set(getSuppressionKey(step), true);
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
  /** Callback to open manual run sheet (for LOAD_DATA step) */
  onManualRunClick?: () => void;
  /** Toast display duration in ms. Defaults to Infinity */
  duration?: number;
  /** When true, auto-suppresses after first show so promo never appears again */
  suppressible?: boolean;
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
      onManualRunClick,
      duration = Infinity,
      suppressible = false,
    }: ShowPromoOptions) => {
      if (suppressible && isPromoSuppressed(step)) return;

      // Auto-suppress after first show
      if (suppressible) suppressPromo(step);

      // Single ID per data mart to prevent multiple toasts for the same data mart
      const toastId = `promo_${dataMartId}`;

      // If a promo toast is already visible for this data mart — skip entirely
      if (activePromoToasts.has(toastId)) return;

      // Common toast lifecycle callbacks
      const onDismiss = () => activePromoToasts.delete(toastId);
      const onAutoClose = () => activePromoToasts.delete(toastId);

      // Mark as active BEFORE calling toast()
      activePromoToasts.add(toastId);

      switch (step) {
        case PromoStep.LOAD_DATA:
          toast(
            <div className='text-foreground text-sm'>Data Mart is ready to load your data</div>,
            {
              id: toastId,
              closeButton: true,
              onDismiss,
              onAutoClose,
              description: (
                <div className='mt-2 flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      toast.dismiss(toastId);
                      onManualRunClick?.();
                    }}
                  >
                    <Play className='h-4 w-4' />
                    Manual Run…
                  </Button>

                  <Button size='sm' variant='ghost' asChild onClick={() => toast.dismiss(toastId)}>
                    <Link to={`/ui/${projectId}/data-marts/${dataMartId}/triggers`}>
                      <CalendarClock className='h-4 w-4' />
                      Schedule Trigger…
                    </Link>
                  </Button>
                </div>
              ),
              duration,
            }
          );
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
