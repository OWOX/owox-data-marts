import { Button } from '@owox/ui/components/button';
import { ExternalLinkIcon } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { Link } from 'react-router-dom';
import type { AppIcon } from '../../icons/icons.types';

const DEFAULT_BG_LIGHT =
  'https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b51b7d09-f9d2-48d0-d318-4d9e8cc6fb00/public';

const DEFAULT_BG_DARK =
  'https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/989747cb-82dd-401b-dac2-ad926e303400/public';

export interface PromoBlockProps {
  icon?: AppIcon;

  title: string;
  description?: string;
  subtitle?: string;

  primaryAction: Action;
  secondaryAction?: Action;

  className?: string;

  size?: 'default' | 'compact';

  backgroundImageLight?: string | null;
  backgroundImageDark?: string | null;
}

type Action =
  | {
      label: string;
      href: string;
      external?: boolean;
      onClick?: never;
    }
  | {
      label: string;
      onClick: () => void;
      href?: never;
      external?: never;
    };

function renderAction(
  action: Action,
  props?: { variant?: 'default' | 'outline'; size?: 'sm' | 'lg' }
) {
  const content = action.external ? (
    <span className='inline-flex items-center gap-1'>
      {action.label}
      <ExternalLinkIcon className='size-4' />
    </span>
  ) : (
    action.label
  );

  if (action.href) {
    return (
      <Button size={props?.size ?? 'lg'} variant={props?.variant} asChild>
        {action.external ? (
          <a
            href={action.href}
            target='_blank'
            rel='noopener noreferrer'
            aria-label={`${action.label} (opens in a new tab)`}
          >
            {content}
          </a>
        ) : (
          <Link to={action.href}>{content}</Link>
        )}
      </Button>
    );
  }

  return (
    <Button size={props?.size ?? 'lg'} variant={props?.variant} onClick={action.onClick}>
      {content}
    </Button>
  );
}

export function PromoBlock({
  icon,
  title,
  description,
  subtitle,
  primaryAction,
  secondaryAction,
  className,
  size = 'default',
  backgroundImageLight,
  backgroundImageDark,
}: PromoBlockProps) {
  const isCompact = size === 'compact';
  const Icon = icon;

  const bgLight =
    backgroundImageLight === null ? undefined : (backgroundImageLight ?? DEFAULT_BG_LIGHT);

  const bgDark =
    backgroundImageDark === null ? undefined : (backgroundImageDark ?? DEFAULT_BG_DARK);

  const borderRoundedClasses =
    'rounded-bl-md lg:rounded-bl-none lg:rounded-tl-2xl xl:rounded-tl-3xl rounded-br-md';

  const borderTopLeftClasses = 'lg:border-t lg:border-l lg:border-white/75 dark:lg:border-black/40';

  const styles = {
    container: cn(
      'mx-auto flex w-full justify-between overflow-hidden',
      'flex-col-reverse lg:flex-row lg:items-center',
      isCompact
        ? 'gap-6 lg:gap-8 lg:pt-4 lg:pl-8'
        : 'gap-12 lg:gap-8 xl:gap-16 2xl:gap-24 lg:pt-8 lg:pl-8 xl:pt-16 xl:pl-16 2xl:pt-20 2xl:pl-20',
      'border-border rounded-md border',
      'bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,var(--color-gray-100),transparent)]',
      'lg:bg-[radial-gradient(ellipse_50%_80%_at_40%_120%,var(--color-gray-100),transparent)]',
      'dark:bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,var(--color-sidebar),transparent)]',
      'dark:lg:bg-[radial-gradient(ellipse_50%_80%_at_40%_120%,var(--color-sidebar),transparent)]'
    ),

    content: cn(
      'mx-auto px-4 sm:px-8 lg:mx-0 lg:px-0',
      isCompact
        ? 'pb-8 lg:pt-4 lg:basis-1/2 2xl:basis-[40%]'
        : 'pb-16 lg:max-w-md xl:pb-24 2xl:pb-32'
    ),

    subtitle: cn(
      'leading-relaxed font-medium',
      isCompact ? 'text-xs mb-3' : 'text-sm md:text-base mb-6'
    ),

    title: cn(
      'leading-tight font-medium',
      isCompact
        ? 'text-xl lg:text-2xl mb-2 lg:mb-3'
        : 'text-3xl md:text-4xl xl:text-5xl mb-2 lg:mb-8'
    ),

    description: cn(
      'text-muted-foreground leading-relaxed dark:text-white/80',
      isCompact ? 'text-sm mb-4 xl:mb-8' : 'text-base md:text-lg mb-8'
    ),

    actions: cn(
      'flex flex-col xl:flex-row',
      'justify-center xl:justify-start',
      isCompact ? 'gap-2' : 'gap-2 xl:gap-4'
    ),

    visualWrapper: cn(
      'relative z-10 flex h-full w-full items-center justify-center',
      isCompact ? 'lg:basis-1/2 2xl:basis-[60%]' : undefined,
      borderTopLeftClasses,
      borderRoundedClasses
    ),

    visualInner: cn(
      'relative z-10 flex h-full w-full items-center justify-center overflow-hidden',
      isCompact ? 'py-8 lg:py-0' : 'py-16 lg:py-0',
      'border-b lg:border-b-0',
      borderTopLeftClasses,
      borderRoundedClasses
    ),

    iconBox: cn(
      'relative z-10 flex items-center justify-center',
      'border border-black/5 dark:border-none',
      'bg-[linear-gradient(180deg,var(--color-background)_0%,color-mix(in_oklch,var(--color-background)_90%,var(--color-muted))_60%,var(--color-muted)_100%)]',
      'dark:bg-[linear-gradient(180deg,var(--color-background)_0%,color-mix(in_oklch,var(--color-sidebar),var(--color-background))_60%,var(--color-sidebar)_100%)]',
      isCompact
        ? 'p-3 md:p-4 lg:p-5 rounded-xl lg:rounded-2xl'
        : 'p-4 md:p-6 lg:p-8 2xl:p-16 rounded-2xl lg:rounded-3xl',
      'shadow-2xl/10 dark:shadow-md/50'
    ),

    icon: isCompact
      ? 'h-8 w-8 md:h-10 md:w-10 lg:h-14 lg:w-14'
      : 'h-12 w-12 md:h-16 md:w-16 lg:h-24 lg:w-24',
  };

  return (
    <div className={cn('flex w-full justify-center', className)}>
      <div className={styles.container}>
        {/* Content */}
        <div className={styles.content}>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          <h2 className={styles.title}>{title}</h2>
          {description && <p className={styles.description}>{description}</p>}

          <div className={styles.actions}>
            {renderAction(primaryAction, { size: isCompact ? 'sm' : 'lg' })}
            {secondaryAction &&
              renderAction(secondaryAction, {
                variant: 'outline',
                size: isCompact ? 'sm' : 'lg',
              })}
          </div>
        </div>

        {/* Visual */}
        {Icon && (
          <div className={styles.visualWrapper}>
            {/* Glow */}
            <div
              className={cn(
                'absolute -bottom-8 -left-8 -z-10 hidden lg:block',
                'h-4/5 w-4/5 blur-2xl',
                'bg-gray-300/40 dark:bg-transparent'
              )}
            />

            <div className={styles.visualInner}>
              <div className={cn('absolute inset-0 overflow-hidden', borderRoundedClasses)}>
                {bgLight && (
                  <img
                    src={bgLight}
                    alt='Background'
                    className='h-full w-full object-cover dark:hidden'
                    onError={e => (e.currentTarget.style.display = 'none')}
                  />
                )}

                {bgDark && (
                  <img
                    src={bgDark}
                    alt='Background'
                    className='hidden h-full w-full object-cover opacity-20 dark:block'
                    onError={e => (e.currentTarget.style.display = 'none')}
                  />
                )}
              </div>

              <div
                className={cn(
                  'absolute inset-0 bg-white/70 dark:bg-black/40',
                  borderRoundedClasses
                )}
              />

              <div className={styles.iconBox}>
                <Icon className={styles.icon} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
