import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@owox/ui/components/button';
import { CalendarClock, FileText, Play, Sparkles } from 'lucide-react';

/**
 * Enum for next step promo types
 */
export enum PromoStep {
  /** Promote loading data: run manually or create scheduled trigger */
  LOAD_DATA = 'load_data',
  /** Promote using data: create insights or reports */
  USE_DATA = 'use_data',
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
}

/**
 * Hook for showing next step promotion toasts after data mart actions
 */
export function useDataMartNextStepPromo() {
  const showPromo = useCallback(
    ({ step, projectId, dataMartId, isInsightsEnabled, onManualRunClick }: ShowPromoOptions) => {
      switch (step) {
        case PromoStep.LOAD_DATA:
          toast(
            <div className='text-foreground text-sm'>Data Mart is ready to load your data</div>,
            {
              closeButton: true,
              description: (
                <div className='mt-2 flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      toast.dismiss();
                      onManualRunClick?.();
                    }}
                  >
                    <Play className='h-4 w-4' />
                    Manual Run…
                  </Button>

                  <Button size='sm' variant='ghost' asChild onClick={() => toast.dismiss()}>
                    <Link to={`/ui/${projectId}/data-marts/${dataMartId}/triggers`}>
                      <CalendarClock className='h-4 w-4' />
                      Schedule Trigger…
                    </Link>
                  </Button>
                </div>
              ),
              duration: Infinity,
            }
          );
          break;

        case PromoStep.USE_DATA:
          toast(<div className='text-foreground text-sm'>Turn your data into results</div>, {
            closeButton: true,
            description: (
              <div className='mt-2 flex gap-2'>
                {isInsightsEnabled && (
                  <Button size='sm' variant='outline' asChild onClick={() => toast.dismiss()}>
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
                  onClick={() => toast.dismiss()}
                >
                  <Link to={`/ui/${projectId}/data-marts/${dataMartId}/reports`}>
                    <FileText className='h-4 w-4' />
                    Create Report…
                  </Link>
                </Button>
              </div>
            ),
            duration: Infinity,
          });
          break;
      }
    },
    []
  );

  return { showPromo };
}
