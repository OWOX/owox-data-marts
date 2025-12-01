import { CalendarClock } from 'lucide-react';

export function TimeTriggerAnnouncement() {
  return (
    <div className='dm-card-block !gap-1.5 !py-3'>
      <div className='text-foreground flex items-start gap-1.5 text-sm'>
        <CalendarClock className='h-5 w-5 shrink-0' aria-hidden='true' />
        <div>
          <p className='font-medium'>Time Triggers</p>
          <p className='text-muted-foreground'>
            Set up automatic runs in the <span className='font-medium'>Triggers</span> tab once
            you’ve saved and published this Data Mart.
          </p>
        </div>
      </div>
    </div>
  );
}
