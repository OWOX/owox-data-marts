import { cn } from '@owox/ui/lib/utils';

interface Props {
  dotClass: string;
  ringClass: string;
  isLoading: boolean;
}

export function DataStorageHealthDot({ dotClass, ringClass, isLoading }: Props) {
  return (
    <div className='relative'>
      <div
        className={cn(
          'h-2 w-2 rounded-full transition-colors',
          dotClass,
          isLoading && 'animate-pulse'
        )}
      />

      <div
        className={cn(
          'pointer-events-none absolute -inset-[3px] rounded-full opacity-0 ring-1 transition-opacity',
          'group-hover:opacity-100 group-focus-visible:opacity-100',
          ringClass
        )}
      />
    </div>
  );
}
