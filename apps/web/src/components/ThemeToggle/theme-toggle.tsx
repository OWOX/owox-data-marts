'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <button
      className='flex items-center gap-2 text-sm hover:bg-transparent'
      onClick={event => {
        setTheme(theme === 'light' ? 'dark' : 'light');
        event.preventDefault();
      }}
    >
      <Sun className='size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90' />
      <Moon className='absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0' />
      <span>Toggle theme</span>
    </button>
  );
}
