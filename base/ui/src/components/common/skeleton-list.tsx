import { Skeleton } from '@owox/ui/components/skeleton';

export function SkeletonList() {
  return (
    <div className='flex flex-col gap-4'>
      <div className='space-y-2 pb-4'>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className='border-border rounded-lg border p-4'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <Skeleton className='h-4 w-4 rounded-full' />
                <Skeleton className='h-4 w-40' />
                <Skeleton className='h-3 w-32' />
              </div>
              <div className='flex items-center gap-2'>
                <Skeleton className='h-6 w-16 rounded-full' />
                <Skeleton className='h-4 w-4' />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
