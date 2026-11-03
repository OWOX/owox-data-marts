import { Loader2 } from 'lucide-react';

export interface ReferencingDataMarts {
  /** The referencing Data Marts the user can see. */
  dataMarts: { id: string; title: string }[];
  /** All referencing Data Marts, including the ones the user cannot see. */
  total: number;
}

const CONSEQUENCE = {
  change: 'Changing this input source may break them:',
  delete: 'They will stop working once this Data Mart is deleted:',
} as const;

const UNKNOWN_CONSEQUENCE = {
  change: 'If any do, this change may break them.',
  delete: 'If any do, they will stop working once it is deleted.',
} as const;

interface ReferencingDataMartsNoticeProps extends ReferencingDataMarts {
  action: keyof typeof CONSEQUENCE;
  /** The check is still running. */
  isLoading?: boolean;
  /**
   * The check failed, for this Data Mart or some of the selected ones, so it is unknown whether
   * (more) Data Marts reference them.
   */
  hasError?: boolean;
}

/**
 * Warns that other SQL Data Marts reference this one in their query. Renders nothing when none do.
 * While the check runs it says so, and a failed check is shown as unknown, not as "none".
 */
export function ReferencingDataMartsNotice({
  dataMarts,
  total,
  action,
  isLoading = false,
  hasError = false,
}: ReferencingDataMartsNoticeProps) {
  if (isLoading) {
    return (
      <p
        role='status'
        data-testid='referencing-data-marts-notice'
        className='text-muted-foreground flex items-center gap-2 text-sm'
      >
        <Loader2 className='size-4 animate-spin' aria-hidden />
        Checking which Data Marts reference this one in their SQL…
      </p>
    );
  }
  if (hasError && total <= 0) {
    return (
      <div
        role='status'
        data-testid='referencing-data-marts-notice'
        className='bg-warning-bg rounded-md px-3 py-2 text-sm'
      >
        <p className='text-warning font-medium'>
          Could not check whether other Data Marts reference this one in their SQL.
        </p>
        <p className='text-muted-foreground'>{UNKNOWN_CONSEQUENCE[action]}</p>
      </div>
    );
  }
  if (total <= 0) return null;
  const hidden = Math.max(0, total - dataMarts.length);

  return (
    <div
      role='status'
      data-testid='referencing-data-marts-notice'
      className='bg-warning-bg rounded-md px-3 py-2 text-sm'
    >
      <p className='text-warning font-medium'>
        Referenced in the SQL of {total} Data Mart{total === 1 ? '' : 's'}.
      </p>
      <p className='text-muted-foreground'>{CONSEQUENCE[action]}</p>
      <ul className='mt-1 list-disc pl-5'>
        {dataMarts.map(dataMart => (
          <li key={dataMart.id} className='break-words'>
            {dataMart.title}
          </li>
        ))}
        {hidden > 0 && (
          <li className='text-muted-foreground'>
            {dataMarts.length > 0 ? 'and ' : ''}
            {hidden} Data Mart{hidden === 1 ? '' : 's'} you don’t have access to
          </li>
        )}
      </ul>
      {hasError && (
        <p className='text-muted-foreground mt-1'>
          Some of the selected Data Marts could not be checked, so more may be affected.
        </p>
      )}
    </div>
  );
}
