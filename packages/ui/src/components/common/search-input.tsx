import { Input } from '@owox/ui/components/input';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface SearchInputProps {
  /** Unique identifier for the input element */
  id: string;
  /** Placeholder text to display when the input is empty */
  placeholder?: string;
  /** Current value of the input */
  value: string;
  /** Callback function to call when the value changes (after debounce) */
  onChange: (value: string) => void;
  /** Time in milliseconds to wait before calling onChange */
  debounceTime?: number;
  /** Optional CSS class name */
  className?: string;
  /** Accessibility label for the input */
  'aria-label'?: string;
}

/** Search input with an icon and debounced onChange callback */
export function SearchInput({
  id,
  placeholder = 'Search',
  value,
  onChange,
  debounceTime = 500,
  className,
  'aria-label': ariaLabel,
}: SearchInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (value === '' || isFirstRender.current) {
      setInputValue(value);
      isFirstRender.current = false;
    }
  }, [value]);

  useEffect(() => {
    if (inputValue === value) return;
    const timer = setTimeout(() => {
      onChange(inputValue);
    }, debounceTime);
    return () => clearTimeout(timer);
  }, [inputValue, debounceTime, onChange, value]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  }, []);

  return (
    <div className='relative w-48 md:w-52 lg:w-96 xl:w-128'>
      <Search
        className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4'
        aria-hidden='true'
      />
      <Input
        id={id}
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        className={
          className ??
          'border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
        }
        aria-label={ariaLabel ?? placeholder}
      />
    </div>
  );
}
