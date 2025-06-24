import { Check } from 'lucide-react';

interface Step {
  id: number;
  title: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className='w-full py-6'>
      <div className='flex items-center justify-between'>
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <div key={step.id} className='flex flex-1 items-center'>
              <div className='flex flex-col items-center'>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-medium ${
                    isCompleted
                      ? 'bg-brand-blue-500 border-brand-blue-500 text-white'
                      : isCurrent
                        ? 'border-brand-blue-500 text-brand-blue-500 bg-white'
                        : 'border-gray-300 bg-white text-gray-500'
                  } `}
                >
                  {isCompleted ? <Check className='h-5 w-5' /> : <span>{stepNumber}</span>}
                </div>

                <div className='mt-2 text-center'>
                  <div
                    className={`text-sm font-medium ${
                      isCurrent ? 'text-brand-blue-600' : 'text-gray-900'
                    }`}
                  >
                    {step.title}
                  </div>
                  {step.description && (
                    <div className='mt-1 text-xs text-gray-500'>{step.description}</div>
                  )}
                </div>
              </div>

              {index < steps.length - 1 && (
                <div
                  className={`mx-4 mt-0 h-px flex-1 ${
                    stepNumber < currentStep ? 'bg-brand-blue-500' : 'bg-gray-300'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
