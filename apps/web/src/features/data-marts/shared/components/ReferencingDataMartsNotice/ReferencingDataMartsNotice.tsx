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

/**
 * Warns that other SQL Data Marts reference this one in their query. Renders nothing when none do.
 */
export function ReferencingDataMartsNotice({
  dataMarts,
  total,
  action,
}: ReferencingDataMarts & { action: keyof typeof CONSEQUENCE }) {
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
    </div>
  );
}
