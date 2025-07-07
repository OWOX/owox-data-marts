import { Badge } from '@owox/ui/components/badge';
import { Skeleton } from '@owox/ui/components/skeleton';
import { type DataDestination } from '../../model';
import { DataDestinationTypeModel } from '../../types';
import { DataDestinationInfo } from '../DataDestinationInfo';

export interface DataDestinationDetailsProps {
  dataDestination?: DataDestination | null;
  isLoading?: boolean;
}

export function DataDestinationDetails({
  dataDestination,
  isLoading = false,
}: DataDestinationDetailsProps) {
  if (isLoading) {
    return (
      <div className='space-y-4'>
        <div className='grid gap-4'>
          {Array(4)
            .fill(0)
            .map((_, index) => (
              <div key={index} className='space-y-1'>
                <Skeleton className='h-5 w-24' />
                <Skeleton className='h-6 w-40' />
              </div>
            ))}
        </div>
      </div>
    );
  }

  if (!dataDestination) {
    return <div>No destination information available.</div>;
  }

  const { type, credentials, createdAt, modifiedAt } = dataDestination;

  return (
    <div className='space-y-2'>
      <div className='grid gap-2'>
        <div className='flex items-center justify-between'>
          <div>{dataDestination.title}</div>
          <Badge variant={'secondary'} className='flex h-7 items-center gap-2'>
            {(() => {
              const { displayName, icon: Icon } = DataDestinationTypeModel.getInfo(type);
              return (
                <>
                  <Icon />
                  {displayName}
                </>
              );
            })()}
          </Badge>
        </div>

        <div className='bg-muted/10 rounded-md border p-4'>
          <DataDestinationInfo type={type} credentials={credentials} />
        </div>

        <div className='text-muted-foreground flex gap-6 text-xs'>
          <div>
            <span className='font-medium'>Created:</span>{' '}
            {new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(createdAt))}
          </div>
          <div>
            <span className='font-medium'>Modified:</span>{' '}
            {new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(modifiedAt))}
          </div>
        </div>
      </div>
    </div>
  );
}
