import { Skeleton } from '@owox/ui/components/skeleton';

export const SkeletonText = () => (
  <div className='space-y-4'>
    <div className='space-y-2'>
      <Skeleton className='h-6 w-3/4' />
      <Skeleton className='h-4 w-1/2' />
    </div>

    <div className='space-y-2'>
      <Skeleton className='h-4 w-full' />
      <Skeleton className='h-4 w-5/6' />
      <Skeleton className='h-4 w-4/5' />
      <Skeleton className='h-4 w-3/4' />
    </div>
  </div>
);
