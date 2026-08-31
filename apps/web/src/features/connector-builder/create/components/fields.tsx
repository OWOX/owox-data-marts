import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';

/** A 13px Lucide info circle with a tooltip, used beside every field label. */
export function FieldInfo({ hint }: { hint: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='text-muted-foreground inline-flex shrink-0 cursor-help items-center'>
            <Info className='h-[13px] w-[13px]' strokeWidth={1.7} />
          </span>
        </TooltipTrigger>
        <TooltipContent className='max-w-[260px] leading-snug'>{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Field label (11.5px/500 muted) with an optional trailing info icon. */
export function InfoLabel({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium',
        className
      )}
    >
      {children}
      {hint && <FieldInfo hint={hint} />}
    </span>
  );
}

/** Section title (16px/500) with an inline muted caption. */
export function SectionHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className='mb-3.5 flex items-baseline gap-2.5'>
      <h3 className='text-foreground text-base font-medium'>{title}</h3>
      {caption && <span className='text-muted-foreground text-xs'>{caption}</span>}
    </div>
  );
}

/** Standard form card: card bg, border, 10px radius, shadow-sm, 18px padding. */
export function FormCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-card rounded-[10px] border p-[18px] shadow-sm', className)}>
      {children}
    </div>
  );
}

/** Segmented pill control — active = primary, inactive = bordered input. Each option is a
 * real <button> so role/name queries keep working.
 *
 * Clicking the option that is already selected does nothing. Consumers treat `onChange` as
 * "the type changed" and seed a fresh default block for the new type, so firing it for a
 * click that changes nothing would silently discard a configured retriever, pagination or
 * authentication block — with no confirmation and no undo. Picking the current value is
 * how a segmented control reports "no change", so the control, not each consumer, is where
 * that is decided. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className='flex flex-wrap gap-2' role='group' aria-label={ariaLabel}>
      {options.map(o => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type='button'
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(o.key);
            }}
            className={cn(
              'rounded-lg border px-4 py-2 text-[13px] transition-colors',
              active
                ? 'bg-card text-foreground font-medium shadow-sm'
                : 'bg-input text-muted-foreground hover:bg-accent'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The sentinel standing in for "nothing selected".
 *
 * Radix's Select reserves the empty string — a `SelectItem` with `value=""` throws — so an
 * optional setting cannot offer its "unset" entry the way a native `<option value="">`
 * does. Callers still speak in `undefined`; the swap is confined to this component.
 */
const UNSET = '__unset__';

/**
 * The builder's dropdown. Replaces the native `<select>` these editors used to render:
 * a browser paints that with its own OS widget — a dark system popup on macOS — which
 * ignores the app's theme and looks like it belongs to a different product. Everything
 * else in the builder (field types, storage pickers) already used this control.
 */
export function OptionSelect({
  value,
  onValueChange,
  options,
  unsetLabel,
  ariaLabel,
  className,
}: {
  /** `undefined` selects the unset entry, which exists only when `unsetLabel` is given. */
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
  options: { value: string; label: string }[];
  /** Text for the "nothing selected" entry, e.g. "— none —". Omit for a required choice. */
  unsetLabel?: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select
      value={value ?? UNSET}
      onValueChange={next => {
        onValueChange(next === UNSET ? undefined : next);
      }}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {unsetLabel !== undefined && (
          <SelectItem value={UNSET} className='text-muted-foreground'>
            {unsetLabel}
          </SelectItem>
        )}
        {options.map(o => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
