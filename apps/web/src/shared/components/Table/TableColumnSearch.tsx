import { type Table } from '@tanstack/react-table';
import { Input } from '@owox/ui/components/input';
import { Search } from 'lucide-react';

export interface TableColumnSearchProps<TData> {
  table: Table<TData>;
  columnId: string;
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export function TableColumnSearch<TData>({
  table,
  columnId,
  placeholder = 'Search',
  value: controlledValue,
  onValueChange,
}: TableColumnSearchProps<TData>) {
  const column = table.getColumn(columnId);

  if (!column?.getCanFilter()) {
    return null;
  }

  const isControlled = controlledValue !== undefined && onValueChange !== undefined;
  const inputValue = isControlled
    ? controlledValue
    : ((column.getFilterValue() as string | undefined) ?? '');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isControlled) {
      onValueChange(event.target.value);
    } else {
      column.setFilterValue(event.target.value);
    }
  };

  return (
    <div className='relative max-w-md min-w-0 flex-1'>
      <Search className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4' />
      <Input
        placeholder={placeholder}
        value={inputValue}
        onChange={handleChange}
        className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
      />
    </div>
  );
}
