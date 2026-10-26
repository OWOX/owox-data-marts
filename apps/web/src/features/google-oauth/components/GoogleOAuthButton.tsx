import { cn } from '@owox/ui/lib/utils';
import type { ComponentProps } from 'react';
import { GoogleIcon } from '../../../shared/icons';

/** The Google sign-in button: the Google logo, or a spinner while busy, then its label. */
export function GoogleOAuthButton({
  busy = false,
  children,
  className,
  ...props
}: ComponentProps<'button'> & { busy?: boolean }) {
  return (
    <button
      type='button'
      className={cn(
        'border-input bg-background hover:bg-accent flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    >
      {busy ? (
        <span className='h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900' />
      ) : (
        <GoogleIcon size={20} className='shrink-0' />
      )}
      {children}
    </button>
  );
}
