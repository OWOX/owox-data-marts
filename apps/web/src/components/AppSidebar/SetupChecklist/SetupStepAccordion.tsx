'use client';

import { isValidElement, cloneElement } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@owox/ui/components/accordion';
import { Button } from '@owox/ui/components/button';
import { useProjectRoute } from '../../../shared/hooks';
import { trackEvent } from '../../../utils/data-layer';
import { formatDateShort } from '../../../utils/date-formatters';
import type { SetupStep, SetupStepProgress } from './types';

interface SetupStepAccordionProps {
  step: SetupStep;
  stepProgress: SetupStepProgress;
  onClose?: () => void;
}

export function SetupStepAccordion({ step, stepProgress, onClose }: SetupStepAccordionProps) {
  const { scope } = useProjectRoute();
  const isCompleted = stepProgress.done;
  const isLinkPathElement = isValidElement(step.linkPath);
  const targetUrl = !isLinkPathElement ? scope(step.linkPath as string) : '';

  const handleStepClick = () => {
    trackEvent({
      event: 'setup_checklist_step_clicked',
      category: 'SetupChecklist',
      action: 'StepClick',
      label: step.id,
      context: isCompleted ? 'completed' : 'incomplete',
    });
  };

  const handleCtaClick = () => {
    trackEvent({
      event: 'setup_checklist_cta_clicked',
      category: 'SetupChecklist',
      action: 'CTAClick',
      label: step.id,
    });
    onClose?.();
  };

  const renderIcon = () => {
    if (isCompleted) {
      return <CheckCircle2 className='text-primary size-4' />;
    }
    return <ArrowRight className='text-muted-foreground size-4' />;
  };

  return (
    <AccordionItem value={step.id} className='border-b last:border-b-0'>
      <AccordionTrigger
        onClick={handleStepClick}
        className={`hover:bg-muted flex w-full cursor-pointer items-center gap-2.5 rounded-none px-2 py-2 text-left text-sm transition-colors ${
          isCompleted ? 'text-primary' : 'text-sidebar-foreground'
        }`}
      >
        <span className='flex items-center gap-2'>
          {renderIcon()}
          <span>{step.label}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className='px-2 pt-1 pb-4'>
        {isCompleted ? (
          <div className='flex flex-col gap-2 pl-6'>
            <p className='text-sm font-medium'>{step.successTitle}</p>
            <p className='text-sm'>{step.successDescription}</p>
            {stepProgress.completedAt && (
              <p className='text-muted-foreground text-xs'>
                Completed on {formatDateShort(stepProgress.completedAt)}
              </p>
            )}
          </div>
        ) : (
          <div className='flex flex-col gap-3 pl-6'>
            <p className='text-sm'>{step.popoverDescription}</p>
            {isLinkPathElement ? (
              <div onClick={handleCtaClick}>
                {cloneElement(step.linkPath as React.ReactElement)}
              </div>
            ) : (
              <Button size='sm' asChild>
                <Link to={targetUrl} onClick={handleCtaClick}>
                  {step.ctaLabel}
                </Link>
              </Button>
            )}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
