import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Link2 } from 'lucide-react';

interface InheritedFieldMetadataProps {
  value?: string;
  inheritedFrom: { dataMartTitle: string };
}

/**
 * The alias or description of a field that passes through from a referenced Data Mart. It is
 * read-only here: it changes in the Data Mart it comes from.
 */
export function InheritedFieldMetadata({ value, inheritedFrom }: InheritedFieldMetadataProps) {
  const source = `From Data Mart “${inheritedFrom.dataMartTitle}”. Change it there.`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className='text-muted-foreground inline-flex min-w-0 cursor-default items-start gap-1'
          data-testid='inherited-field-metadata'
        >
          <Link2 className='mt-0.5 size-3 shrink-0' aria-hidden />
          <span className='min-w-0 break-words'>{value?.trim() ? value : '-'}</span>
          <span className='sr-only'>{source}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{source}</TooltipContent>
    </Tooltip>
  );
}
