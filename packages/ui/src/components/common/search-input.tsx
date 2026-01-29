import { Input } from '@owox/ui/components/input';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Props for the SearchInput component
 */
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

/**
 * Search input component with debounce functionality
 * Provides a search input with an icon and debounced onChange callback
 */
export function SearchInput({
  id,
  placeholder = 'Search',
  value,
  onChange,
  debounceTime = 500,
  className,
  'aria-label': ariaLabel,
}: SearchInputProps) {
  // Local state to track input value before debouncing
  const [inputValue, setInputValue] = useState(value);

  // Only update local state from external value on initial render or when value is cleared externally
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Only update if value is empty or on first render
    if (value === '' || isFirstRender.current) {
      setInputValue(value);
      isFirstRender.current = false;
    }
  }, [value]);

  // Handle input change with debounce
  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      setInputValue(newValue);

      // Set up debounce timer
      const timer = setTimeout(() => {
        onChange(newValue);
      }, debounceTime);

      // Clean up timer on next change
      return () => {
        clearTimeout(timer);
      };
    },
    [onChange, debounceTime]
  );

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
