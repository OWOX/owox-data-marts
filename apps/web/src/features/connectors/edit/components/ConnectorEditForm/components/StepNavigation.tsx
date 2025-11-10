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
  finishLabel = 'Save',
}: StepNavigationProps) {
  const isLastStep = currentStep === totalSteps;

  // Single-step layout
  if (totalSteps === 1) {
    return (
      <div className='w-full'>
        <Button
          className='w-full'
          variant='default'
          onClick={onFinish}
          disabled={!canGoNext || isLoading}
        >
          {finishLabel}
        </Button>
      </div>
    );
  }

  // Multi-step layout
  return (
    <div className='flex w-full items-center justify-between gap-4'>
      <div className='flex-1'>
        {canGoBack && (
          <Button variant='outline' onClick={onBack} disabled={isLoading}>
            <ChevronLeft className='h-4 w-4' />
            {backLabel}
          </Button>
        )}
      </div>

      <div className='text-muted-foreground/75 px-4 text-sm'>
        Step {currentStep} of {totalSteps}
      </div>

      <div className='flex flex-1 justify-end'>
        {isLastStep ? (
          <Button variant='default' onClick={onFinish} disabled={!canGoNext || isLoading}>
            {finishLabel}
          </Button>
        ) : (
          <Button variant='default' onClick={onNext} disabled={!canGoNext || isLoading}>
            {nextLabel}
            <ChevronRight className='h-4 w-4' />
          </Button>
        )}
      </div>
    </div>
  );
}
