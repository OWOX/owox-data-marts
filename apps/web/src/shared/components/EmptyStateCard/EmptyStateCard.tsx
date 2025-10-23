'use client';

import * as React from 'react';
import { cn } from '@owox/ui/lib/utils';
import { Button } from '@owox/ui/components/button';
import { Link } from 'react-router-dom';

/* --------------------------------------------------------------------------
 * Main wrapper: EmptyStateCard
 * -------------------------------------------------------------------------- */
interface EmptyStateCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function EmptyStateCard({ children, className = '', ...props }: EmptyStateCardProps) {
  return (
    <div
      className={cn(
        '-m-4 flex flex-col items-start justify-between gap-12 overflow-hidden px-8 py-16 lg:flex-row-reverse lg:px-16 lg:py-24 2xl:items-center',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Header: EmptyStateCardHeader
 * -------------------------------------------------------------------------- */
interface EmptyStateCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function EmptyStateCardHeader({
  children,
  className = '',
  ...props
}: EmptyStateCardHeaderProps) {
  return (
    <div className={cn('pb-2', className)} {...props}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Card title: EmptyStateCardTitle
 * -------------------------------------------------------------------------- */
interface EmptyStateCardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export function EmptyStateCardTitle({
  children,
  className = '',
  ...props
}: EmptyStateCardTitleProps) {
  return (
    <h2 className={cn('mb-6 text-4xl font-semibold xl:text-5xl', className)} {...props}>
      {children}
    </h2>
  );
}

/* --------------------------------------------------------------------------
 * Card Sub title: EmptyStateCardSubTitle
 * -------------------------------------------------------------------------- */
interface EmptyStateCardSubTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export function EmptyStateCardSubTitle({
  children,
  className = '',
  ...props
}: EmptyStateCardSubTitleProps) {
  return (
    <p className={cn('text-muted-foreground text-lg', className)} {...props}>
      {children}
    </p>
  );
}

/* --------------------------------------------------------------------------
 * Illustration: EmptyStateCardIllustration
 * -------------------------------------------------------------------------- */
interface EmptyStateCardIllustrationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  rings?: number;
}

export function EmptyStateCardIllustration({
  children,
  rings = 7,
  className = '',
  ...props
}: EmptyStateCardIllustrationProps) {
  return (
    <div
      className={cn('relative flex w-full justify-center lg:w-1/4 2xl:w-1/2', className)}
      {...props}
    >
      <div className='absolute inset-0 flex items-center justify-center'>
        {Array.from({ length: rings }, (_, i) => {
          const size = `${(16 * (i + 1) + 24).toString()}vmin`;
          return (
            <div
              key={i}
              className='animate-ring-pulse'
              style={{
                height: size,
                width: size,
                animationDelay: `${(i * 0.3).toString()}s`,
                animationDuration: '4s',
                opacity: 0.2 + i * 0.1,
                filter: i === 0 ? 'blur(1px)' : 'none',
              }}
            />
          );
        })}
      </div>

      <div className='animate-glow-burst' />

      <div className='animate-icon-entrance' aria-label='Illustration'>
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Content wrapper: EmptyStateCardContent
 * -------------------------------------------------------------------------- */
interface EmptyStateCardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function EmptyStateCardContent({
  children,
  className = '',
  ...props
}: EmptyStateCardContentProps) {
  return (
    <div className={cn('w-full space-y-8 lg:w-3/4 2xl:w-1/2', className)} {...props}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Section wrapper: EmptyStateCardSection
 * -------------------------------------------------------------------------- */
interface EmptyStateCardSectionProps extends React.HTMLAttributes<HTMLElement> {
  separator?: boolean;
  children: React.ReactNode;
}

export function EmptyStateCardSection({
  separator = true,
  children,
  className = '',
  ...props
}: EmptyStateCardSectionProps) {
  return (
    <section
      className={cn(
        'relative pb-10',
        separator &&
          'after:from-border after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-gradient-to-r after:to-transparent',
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

/* --------------------------------------------------------------------------
 * Section title: EmptyStateCardSectionTitle
 * -------------------------------------------------------------------------- */
interface EmptyStateCardSectionTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export function EmptyStateCardSectionTitle({
  children,
  className = '',
  ...props
}: EmptyStateCardSectionTitleProps) {
  return (
    <h3 className={cn('mb-4 text-xl font-medium', className)} {...props}>
      {children}
    </h3>
  );
}

/* --------------------------------------------------------------------------
 * Section content wrapper: EmptyStateCardSectionContent
 * -------------------------------------------------------------------------- */
interface EmptyStateCardSectionContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function EmptyStateCardSectionContent({
  children,
  className = '',
  ...props
}: EmptyStateCardSectionContentProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)} {...props}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Action button: EmptyStateCardActionButton
 * -------------------------------------------------------------------------- */
type EmptyStateCardActionButtonVariant = 'outline' | 'ghost';

interface EmptyStateCardActionButtonProps {
  href?: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  variant?: EmptyStateCardActionButtonVariant;
  size?: 'sm' | 'lg';
  className?: string;
  target?: string;
}

export function EmptyStateCardActionButton({
  href,
  icon,
  title,
  variant = 'outline',
  size,
  className = '',
  target,
  ...props
}: EmptyStateCardActionButtonProps) {
  const defaultSize = variant === 'outline' ? 'lg' : 'sm';

  const content = (
    <span className={cn('flex items-center gap-2')}>
      {icon}
      {title}
    </span>
  );

  if (href) {
    return (
      <Button
        asChild
        variant={variant}
        size={size ?? defaultSize}
        className={cn(variant === 'ghost' ? 'text-muted-foreground' : '', className)}
        {...props}
      >
        <Link to={href} target={target}>
          {content}
        </Link>
      </Button>
    );
  }

  return (
    <Button variant={variant} size={size ?? defaultSize} className={className} {...props}>
      {content}
    </Button>
  );
}
