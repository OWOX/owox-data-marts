import { CalendarClock, Columns3, FileText, Link2, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DATA_MART_SHARING_TEXTS } from '../../../../shared/components/AvailabilitySheet/data-mart-sharing-texts';

/**
 * Icons of the count pills on a Data Mart card, shared by the Models canvas and
 * the Joinable Data Marts diagram so a count reads the same on both.
 */
export const CARD_COUNT_BADGE_ICONS = {
  fields: Columns3,
  triggers: CalendarClock,
  reports: FileText,
  // The icon the Joinable Data Marts section uses, so relationships read the same everywhere.
  relationships: Link2,
} as const satisfies Record<string, LucideIcon>;

/**
 * Soft-filled pill with a leading icon, as on the product website's Data Mart cards.
 * The layout estimate relies on these classes: keep `px-1.5`, `gap-1` and the `h-3 w-3`
 * icon in sync with `CARD_BADGE_CHROME`, and `text-[11px]` with `CARD_BADGE_FONT_SIZE_PX`.
 */
export function CardPill({
  icon: Icon,
  children,
  toggle,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  /** Makes the pill a button that opens and closes a section of the card. */
  toggle?: { expanded: boolean; label: string; onToggle: () => void };
  /** Tooltip of a plain pill, for a label that does not explain itself. */
  title?: string;
}) {
  const className =
    'inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] leading-none whitespace-nowrap';
  const content = (
    <>
      <span className='inline-flex shrink-0' aria-hidden='true'>
        <Icon className='h-3 w-3' />
      </span>
      {children}
    </>
  );
  if (!toggle) {
    return (
      <span className={`bg-muted text-muted-foreground ${className}`} title={title}>
        {content}
      </span>
    );
  }
  return (
    <button
      type='button'
      className={`nodrag cursor-pointer transition-colors ${className} ${
        toggle.expanded
          ? 'bg-foreground/10 text-foreground'
          : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-foreground/10'
      }`}
      aria-expanded={toggle.expanded}
      aria-label={toggle.label}
      title={toggle.label}
      onPointerDown={e => {
        e.stopPropagation();
      }}
      onClick={e => {
        // The card itself toggles its edge highlight on click — keep the two apart.
        e.stopPropagation();
        toggle.onToggle();
      }}
    >
      {content}
    </button>
  );
}

/**
 * A sharing flag in the card footer; renders nothing while the flag is off or
 * unknown. The tooltip names the flag and what it allows, in the words of the
 * Share Data Mart sheet.
 */
export function SharingIcon({
  icon: Icon,
  flag,
  on,
}: {
  icon: LucideIcon;
  flag: keyof typeof DATA_MART_SHARING_TEXTS;
  on?: boolean;
}) {
  if (!on) return null;
  const { label, description } = DATA_MART_SHARING_TEXTS[flag];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          className='hover:text-foreground nodrag inline-flex cursor-default rounded p-0.5 transition-colors'
          aria-label={label}
          onPointerDown={e => {
            e.stopPropagation();
          }}
        >
          <Icon className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </TooltipTrigger>
      <TooltipContent side='top' align='end' role='tooltip' className='max-w-xs'>
        <div className='text-xs font-medium'>{label}</div>
        <div className='text-xs opacity-80'>{description}</div>
      </TooltipContent>
    </Tooltip>
  );
}
