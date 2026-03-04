import { Skeleton } from '@owox/ui/components/skeleton';

export function AiAssistantSkeleton() {
  return (
    <div className='space-y-3'>
      <div className='flex items-start gap-2'>
        <Skeleton className='mt-1 h-6 w-6 shrink-0 rounded-full' />
        <div className='bg-muted/60 flex-1 space-y-2 rounded-2xl rounded-tl-sm p-3'>
          <Skeleton className='h-3 w-3/4' />
          <Skeleton className='h-3 w-full' />
          <Skeleton className='h-3 w-1/2' />
        </div>
      </div>

      <div className='flex justify-end'>
        <Skeleton className='h-8 w-[55%] rounded-2xl rounded-tr-sm' />
      </div>

      <div className='flex items-start gap-2'>
        <Skeleton className='mt-1 h-6 w-6 shrink-0 rounded-full' />
        <div className='bg-muted/60 flex-1 space-y-2 rounded-2xl rounded-tl-sm p-3'>
          <Skeleton className='h-3 w-full' />
          <Skeleton className='h-3 w-4/5' />
          <Skeleton className='h-3 w-full' />
          <Skeleton className='h-3 w-2/3' />
        </div>
      </div>
    </div>
  );
}
