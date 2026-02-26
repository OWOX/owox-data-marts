import { useState, useEffect } from 'react';
import { Input } from '@owox/ui/components/input';

interface InputValueControlProps {
  value: string[];
  onChange: (value: string[]) => void;
}

export function InputValueControl({ value, onChange }: InputValueControlProps) {
  const [inputValue, setInputValue] = useState(value[0] ?? '');

  useEffect(() => {
    setInputValue(value[0] ?? '');
  }, [value]);

  return (
    <Input
      placeholder='Value'
      value={inputValue}
      onChange={e => {
        const next = e.target.value;
        setInputValue(next);

        if (next.length > 0) {
          onChange([next]);
        } else {
          onChange([]);
        }
      }}
      onKeyDown={e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
      }}
    />
  );
}
