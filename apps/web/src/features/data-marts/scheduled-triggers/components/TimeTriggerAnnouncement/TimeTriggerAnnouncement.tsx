import { Timer } from 'lucide-react';

export function TimeTriggerAnnouncement() {
  return (
    <div className='border-border flex flex-col gap-2 rounded-md border-b bg-white px-4 py-4 transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4'>
      <div className='flex items-start gap-3 rounded-md bg-blue-50 p-3 dark:bg-blue-950/20'>
        <Timer className='h-5 w-5 shrink-0' aria-hidden='true' />
        <div>
          <p className='text-sm font-medium'>Time Triggers Now Available!</p>
          <p className='text-sm'>
            Create scheduled runs for your reports or connectors in the Triggers section. This
            powerful feature allows you to automate your reporting workflow.
          </p>
        </div>
      </div>
    </div>
  );
}
