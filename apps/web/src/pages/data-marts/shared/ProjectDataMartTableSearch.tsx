import { Input } from '@owox/ui/components/input';
import { Search } from 'lucide-react';

interface ProjectDataMartTableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ProjectDataMartTableSearch({
  value,
  onChange,
  placeholder = 'Search',
}: ProjectDataMartTableSearchProps) {
  return (
    <div className='relative max-w-md min-w-0 flex-1'>
      <Search className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4' />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={event => {
          onChange(event.target.value);
        }}
        className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
      />
    </div>
  );
}
