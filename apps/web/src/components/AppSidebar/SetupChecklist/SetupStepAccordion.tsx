import { Link } from 'react-router-dom';
import { ArrowRight, CircleCheckBig, PartyPopper } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@owox/ui/components/accordion';
import { Button } from '@owox/ui/components/button';
import { useProjectRoute } from '../../../shared/hooks';
import { formatDateShort } from '../../../utils/date-formatters';
import { StepActionType, type SetupStep, type SetupStepProgress } from './types';
import { useCallback } from 'react';

interface SetupStepAccordionProps {
  step: SetupStep;
  stepProgress: SetupStepProgress;
  onClose?: () => void;
}

export function SetupStepAccordion({ step, stepProgress, onClose }: SetupStepAccordionProps) {
  const { scope } = useProjectRoute();
  const isCompleted = stepProgress.done;

  const handleCtaClick = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const iconNode = isCompleted ? (
    <CircleCheckBig className='text-muted-foreground/50 size-4' />
  ) : (
    <ArrowRight className='text-muted-foreground size-4' />
  );

  const actionNode = (() => {
    switch (step.action.type) {
      case StepActionType.LINK: {
        const targetUrl = scope(step.action.href);
        return (
          <Button size='sm' asChild>
            <Link to={targetUrl} onClick={handleCtaClick}>
              {step.action.label}
            </Link>
          </Button>
        );
      }

      case StepActionType.COMPONENT: {
        return step.action.render({
          onClick: handleCtaClick,
        });
      }

      default:
        return null;
    }
  })();

  return (
    <AccordionItem value={step.id} className='border-b last:border-b-0'>
      <AccordionTrigger
        className={`hover:bg-muted flex w-full cursor-pointer items-center gap-2.5 rounded-none px-2 py-2 text-left text-sm transition-colors ${
          isCompleted
            ? 'text-muted-foreground/50 font-normal line-through'
            : 'text-sidebar-foreground'
        }`}
      >
        <span className='flex items-center gap-2'>
          {iconNode}
          <span>{step.stepTitle}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className='px-2 pt-1 pb-4'>
        {isCompleted ? (
          <div className='bg-primary/5 animate-in fade-in zoom-in-95 -mb-6 flex flex-col items-center gap-1 rounded-md p-4 text-center duration-300'>
            <PartyPopper className='text-primary mb-0.5 size-6' />
            <p className='text-primary text-sm font-medium'>{step.successMessage}</p>
            {stepProgress.completedAt && (
              <p className='text-primary/50 text-xs'>{formatDateShort(stepProgress.completedAt)}</p>
            )}
          </div>
        ) : (
          <div className='-mb-4 flex flex-col gap-2 pl-6'>
            <p className='text-muted-foreground text-sm'>{step.stepDescription}</p>
            {actionNode}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
