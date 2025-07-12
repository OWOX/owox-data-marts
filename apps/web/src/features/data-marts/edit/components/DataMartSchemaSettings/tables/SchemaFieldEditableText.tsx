import { Input } from '@owox/ui/components/input';

interface SchemaFieldEditableTextProps {
  value: string;
  placeholder?: string;
  onValueChange?: (newValue: string) => void;
}

export function SchemaFieldEditableText({
  value,
  placeholder = '',
  onValueChange,
}: SchemaFieldEditableTextProps) {
  // Handle value change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onValueChange) {
      onValueChange(e.target.value);
    }
  };

  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={handleChange}
      className='hover:border-input focus-visible:border-ring focus-visible:dark:bg-input/30 w-full border-0 pr-3 pl-0 shadow-none hover:shadow-xs focus-visible:pl-3 focus-visible:shadow-xs dark:bg-transparent'
    />
  );
}
