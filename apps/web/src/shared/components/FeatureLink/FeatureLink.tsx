import { type FeatureLinkProps } from './types';
import { type ElementType } from 'react';

export function FeatureLink({
  href,
  children,
  icon,
  iconPosition = 'right',
  className = '',
  target = '_blank',
  rel = 'noopener noreferrer',
  ...props
}: FeatureLinkProps) {
  const Icon = icon as ElementType | undefined;

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={`group flex w-full items-center gap-1 rounded-sm p-1 transition hover:bg-gray-200/50 dark:hover:bg-white/10 ${className}`}
      {...props}
    >
      {Icon && iconPosition === 'left' && (
        <Icon
          className='h-2.5 w-2.5 text-gray-400 transition group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'
          aria-hidden='true'
        />
      )}
      <span className='text-foreground block min-w-0 flex-1 truncate text-sm'>{children}</span>
      {Icon && iconPosition === 'right' && (
        <Icon
          className='h-2.5 w-2.5 text-gray-400 transition group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'
          aria-hidden='true'
        />
      )}
    </a>
  );
}
