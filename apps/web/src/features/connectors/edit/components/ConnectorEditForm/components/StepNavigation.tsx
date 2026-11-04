import { Button } from '@owox/ui/components/button';
import { ButtonGroup } from '@owox/ui/components/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface StepNavigationProps {
  currentStep: number;
  totalSteps: number;
  canGoNext: boolean;
  canGoBack: boolean;
  isLoading?: boolean;
  onNext: () => void;
  onBack: () => void;
  onFinish: (runAfterSave: boolean) => void;
  /** Makes "Save & Run" the final action and moves the plain save into its menu. */
  canRunAfterSave?: boolean;
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
  canRunAfterSave = false,
  nextLabel = 'Next',
  backLabel = 'Back',
  finishLabel = 'Save',
}: StepNavigationProps) {
  const isLastStep = currentStep === totalSteps;
  const isFinishDisabled = !canGoNext || isLoading;

  const renderFinish = (fullWidth: boolean) =>
    canRunAfterSave ? (
      <ButtonGroup className={fullWidth ? 'w-full' : undefined}>
        <Button
          className={fullWidth ? 'flex-1' : undefined}
          variant='default'
          onClick={() => {
            onFinish(true);
          }}
          disabled={isFinishDisabled}
        >
          Save & Run
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='default'
              disabled={isFinishDisabled}
              aria-label='More actions'
              className='group'
            >
              <ChevronDown
                className='size-4 transition-transform duration-200 group-data-[state=open]:rotate-180'
                aria-hidden='true'
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' side='top'>
            <DropdownMenuItem
              onClick={() => {
                onFinish(false);
              }}
            >
              {finishLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    ) : (
      <Button
        className={fullWidth ? 'w-full' : undefined}
        variant='default'
        onClick={() => {
          onFinish(false);
        }}
        disabled={isFinishDisabled}
      >
        {finishLabel}
      </Button>
    );

  // Single-step layout
  if (totalSteps === 1) {
    return <div className='w-full'>{renderFinish(true)}</div>;
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
          renderFinish(false)
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
