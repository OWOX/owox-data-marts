import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';

/**
 * ExternalAnchor component renders a styled anchor tag for external URLs
 * with an external link icon and proper security attributes.
 *
 * @param {string} href - The URL to open.
 * @param {React.ReactNode} children - The link text or content.
 * @param {string} [className] - Additional CSS classes.
 * @param {object} [rest] - Other anchor tag props.
 * @param {ExternalAnchorVariant} [variant] - The variant of the external anchor.
 * @example
 * <ExternalAnchor href='https://example.com'>Example</ExternalAnchor>
 */

type ExternalAnchorVariant = 'default' | 'field';

export function ExternalAnchor({
  href,
  children,
  className,
  variant = 'default',
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ExternalAnchorVariant;
}) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        // base
        'items-center font-medium',

        // variants
        variant === 'default' &&
          'text-muted-foreground hover:bg-muted inline-flex px-1 underline hover:rounded-md',

        variant === 'field' &&
          'text-foreground hover:bg-muted focus:ring-ring flex w-full justify-between rounded-md border px-4 py-2 text-sm font-normal no-underline focus:ring-2 focus:ring-offset-2 focus:outline-none',

        className
      )}
      {...rest}
    >
      <span className='truncate'>{children}</span>

      <ExternalLink className='ml-2 h-3 w-3 shrink-0' aria-hidden='true' />
    </a>
  );
}
