import { Button } from '@owox/ui/components/button';
import { CalendarClock, FileText, Play, Sparkles } from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { storageService } from '../../../../services';

// Set to track currently visible promo toasts
const activePromoToasts = new Set<string>();

const SUPPRESSION_KEY_PREFIX = 'promo_suppressed_';
const SUPPRESSION_DURATION_DAYS = 14;
const MS_PER_DAY = 86_400_000;

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

/** Returns true if the promo is currently suppressed by the user */
function isPromoSuppressed(step: PromoStep): boolean {
  const raw = storageService.get(getSuppressionKey(step));
  if (!raw) return false;
  // storageService stores numbers as strings internally (via String()),
  // so we convert back with Number()
  const suppressedUntil = Number(raw);
  return Number.isFinite(suppressedUntil) && Date.now() < suppressedUntil;
}

/** Suppress the promo for the given number of days */
function suppressPromo(step: PromoStep, days: number): void {
  const until = Date.now() + days * MS_PER_DAY;
  storageService.set(getSuppressionKey(step), until);
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
  /** When true, checks suppression and shows "Don't show for N days" button */
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

      // Single ID per data mart to prevent multiple toasts for the same data mart
      const toastId = `promo_${dataMartId}`;

      // If a promo toast is already visible for this data mart — skip entirely
      if (activePromoToasts.has(toastId)) return;

      const suppressButton = suppressible ? (
        <button
          className='text-muted-foreground hover:text-foreground mx-auto mt-3 block cursor-pointer text-xs underline-offset-2 hover:underline'
          onClick={() => {
            suppressPromo(step, SUPPRESSION_DURATION_DAYS);
            toast.dismiss(toastId);
          }}
        >
          Don't show for {SUPPRESSION_DURATION_DAYS} days
        </button>
      ) : null;

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
                <div>
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

                    <Button
                      size='sm'
                      variant='ghost'
                      asChild
                      onClick={() => toast.dismiss(toastId)}
                    >
                      <Link to={`/ui/${projectId}/data-marts/${dataMartId}/triggers`}>
                        <CalendarClock className='h-4 w-4' />
                        Schedule Trigger…
                      </Link>
                    </Button>
                  </div>
                  {suppressButton}
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
              <div>
                <div className='mt-2 flex gap-2'>
                  {isInsightsEnabled && (
                    <Button
                      size='sm'
                      variant='outline'
                      asChild
                      onClick={() => toast.dismiss(toastId)}
                    >
                      <Link to={`/ui/${projectId}/data-marts/${dataMartId}/insights`}>
                        <Sparkles className='h-4 w-4' />
                        Generate Insights…
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
                {suppressButton}
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
