interface InfoRowProps {
  label: string;
  value?: string;
  truncate?: boolean;
}

export const InfoRow = ({ label, value, truncate = false }: InfoRowProps) => {
  const trimmedValue = typeof value === 'string' ? value.trim() : value;
  const isEmpty = trimmedValue === '';

  return (
    <div className='grid grid-cols-2 gap-1'>
      <span className='text-muted-foreground text-sm'>{label}:</span>
      {truncate && trimmedValue && !isEmpty ? (
        <span className='truncate text-sm' title={trimmedValue}>
          {trimmedValue.length > 30 ? trimmedValue.substring(0, 30) + '...' : trimmedValue}
        </span>
      ) : (
        <span className='text-sm'>
          {isEmpty || trimmedValue === undefined ? (
            <span className='text-muted-foreground'>—</span>
          ) : (
            trimmedValue
          )}
        </span>
      )}
    </div>
  );
};
