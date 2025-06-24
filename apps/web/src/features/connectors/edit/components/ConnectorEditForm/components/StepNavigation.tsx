import { Button } from '@owox/ui/components/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface StepNavigationProps {
  currentStep: number;
  totalSteps: number;
  canGoNext: boolean;
  canGoBack: boolean;
  isLoading?: boolean;
  onNext: () => void;
  onBack: () => void;
  onFinish: () => void;
  nextLabel?: string;
  backLabel?: string;
  finishLabel?: string;
}

export function StepNavigation({
  currentStep,
  totalSteps,
  canGoNext,
  canGoBack,
  isLoading = false,
  onNext,
  onBack,
  onFinish,
  nextLabel = 'Next',
  backLabel = 'Back',
  finishLabel = 'Finish',
}: StepNavigationProps) {
  const isLastStep = currentStep === totalSteps;

  return (
    <div className='flex items-center justify-between'>
      <div className='flex-1'>
        {canGoBack && (
          <Button
            variant='outline'
            onClick={onBack}
            disabled={isLoading}
            className='flex items-center gap-2'
          >
            <ChevronLeft className='h-4 w-4' />
            {backLabel}
          </Button>
        )}
      </div>

      <div className='px-4 text-sm text-gray-500'>
        Step {currentStep} of {totalSteps}
      </div>

      <div className='flex flex-1 justify-end'>
        {isLastStep ? (
          <Button
            onClick={onFinish}
            disabled={!canGoNext || isLoading}
            className='flex items-center gap-2'
          >
            {finishLabel}
          </Button>
        ) : (
          <Button
            onClick={onNext}
            disabled={!canGoNext || isLoading}
            className='flex items-center gap-2'
          >
            {nextLabel}
            <ChevronRight className='h-4 w-4' />
          </Button>
        )}
      </div>
    </div>
  );
}
