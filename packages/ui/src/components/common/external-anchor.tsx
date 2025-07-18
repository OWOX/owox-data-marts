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
 * @example
 * <ExternalAnchor href='https://example.com'>Example</ExternalAnchor>
 */
export function ExternalAnchor({
  href,
  children,
  className,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        'text-muted-foreground hover:bg-muted inline-flex items-center px-1 font-medium hover:rounded-md',
        className
      )}
      {...rest}
    >
      {children}
      <ExternalLink className='ml-1 inline h-3 w-3' aria-hidden='true' />
    </a>
  );
}
