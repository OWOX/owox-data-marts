import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

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
          toast('Get your data now', {
            closeButton: true,
            description: (
              <>
                Start connector{' '}
                <span
                  className='cursor-pointer underline underline-offset-4'
                  onClick={() => {
                    toast.dismiss();
                    onManualRunClick?.();
                  }}
                >
                  run manually
                </span>{' '}
                or create a{' '}
                <Link
                  to={`/ui/${projectId}/data-marts/${dataMartId}/triggers`}
                  className='underline underline-offset-4'
                  onClick={() => toast.dismiss()}
                >
                  scheduled trigger
                </Link>
                .
              </>
            ),
            duration: Infinity,
          });
          break;

        case PromoStep.USE_DATA:
          toast('Go-go-go...', {
            closeButton: true,
            description: isInsightsEnabled ? (
              <>
                <Link
                  to={`/ui/${projectId}/data-marts/${dataMartId}/insights`}
                  className='underline underline-offset-4'
                  onClick={() => toast.dismiss()}
                >
                  Generate Insights
                </Link>{' '}
                based on your Data Mart or{' '}
                <Link
                  to={`/ui/${projectId}/data-marts/${dataMartId}/reports`}
                  className='underline underline-offset-4'
                  onClick={() => toast.dismiss()}
                >
                  create Report
                </Link>
                ...
              </>
            ) : (
              <>
                <Link
                  to={`/ui/${projectId}/data-marts/${dataMartId}/reports`}
                  className='underline underline-offset-4'
                  onClick={() => toast.dismiss()}
                >
                  Create Report
                </Link>{' '}
                to share your data.
              </>
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
