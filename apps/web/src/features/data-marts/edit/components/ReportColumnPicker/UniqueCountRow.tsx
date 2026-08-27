import { useId } from 'react';
import { cn } from '@owox/ui/lib/utils';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Sigma, TriangleAlert } from 'lucide-react';
import { FieldInfoTooltip } from './FieldInfoTooltip';
import type {
  UniqueCountSourceState,
  UniqueCountUnavailableReason,
} from '../../../shared/utils/unique-count-availability';

// Presentation is the one place both rules' verdicts legitimately meet, so this table covers the
// reasons either of them can give. The Data Mart is named in every one: the row itself no longer
// does, and a hint about "this Data Mart" beside a joined row is ambiguous with the report's own.
// The name never opens a sentence, so the nameless fallback needs no separate casing.
const UNIQUE_COUNT_HINT_CAUSES: Record<UniqueCountUnavailableReason, (name: string) => string> = {
  // One reason, not two: the main mart's payload has already had its hidden fields stripped, so the
  // client cannot tell an absent key from a hidden one — and a wrong cause is worse than a broad one.
  'primary-key-unavailable': name =>
    `No Primary Key is available for reporting in ${name}, so unique values can't be counted`,
  'no-primary-key': name => `Primary Key is not set for ${name}`,
  'disconnected-primary-key': name =>
    `Part of the Primary Key of ${name} is disconnected, so unique values can't be counted`,
  'nested-primary-key': name => `Unique Count doesn't support the nested Primary Key of ${name}`,
  // Both causes in one sentence: naming only the nesting sent the user to fix that and left the
  // metric just as unavailable, for a reason they were never shown.
  'nested-and-disconnected-primary-key': name =>
    `The Primary Key of ${name} is a nested field, which Unique Count doesn't support, and part of it is disconnected`,
};

const REACH_ANALYST = 'Reach your analyst to handle it';

// A separate line, so the cause and what to do about it do not run together in one paragraph.
const UNIQUE_COUNT_HINT_ACTIONS: Partial<Record<UniqueCountUnavailableReason, string>> = {
  'nested-and-disconnected-primary-key': `Both need fixing — reach your analyst to handle it`,
};

function uniqueCountHint(reason: UniqueCountUnavailableReason, dataMartName?: string): string {
  const name = dataMartName?.trim() ?? '';
  const cause = UNIQUE_COUNT_HINT_CAUSES[reason](name.length > 0 ? name : 'this Data Mart');
  return `${cause}.\n${UNIQUE_COUNT_HINT_ACTIONS[reason] ?? REACH_ANALYST}`;
}

const NOT_EMITTED_NOTE =
  'This Data Mart is not allowed for reporting, so this column is not generated. Allow it for reporting again, or clear this row.';

// A verdict this bundle cannot read (version skew) keeps the selection, but the row must not read
// as a confirmed one — the report may already be failing server-side and nothing else would say so.
const UNVERIFIED_NOTE =
  "This app can't confirm whether this Data Mart can still be counted, so the column may be missing from the report. Your selection is kept — reload the page, and reach your analyst if it stays this way.";

const TRIGGER_BASE_CLASS =
  'min-w-0 truncate text-left font-mono text-xs underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded';
const TRIGGER_CLASS = `text-muted-foreground hover:text-foreground ${TRIGGER_BASE_CLASS}`;
const NOT_EMITTED_TRIGGER_CLASS = `text-destructive ${TRIGGER_BASE_CLASS}`;

export interface UniqueCountRowProps {
  /** Display label only — the metric's SQL column name is derived on the backend. */
  label: string;
  /**
   * What the metric counts, shown through the same ⓘ a field row uses. Absent when there is no
   * usable key: the row is then disabled and its hint is the explanation.
   */
  description?: string;
  /** Named by the unavailable hint, so it says WHICH Data Mart's key has to be fixed. */
  dataMartName?: string;
  /** Either rule's verdict; `undefined` when the source is not in the schema at all. */
  state: UniqueCountSourceState | undefined;
  /** Whether the metric is ACTIVE — configured and still able to run, never one without the other. */
  checked: boolean;
  /**
   * Whether the metric reaches the rendered SELECT. False on a source kept in the config but
   * dropped from the query (an excluded one) — the row must say so instead of reading as live.
   */
  isEmitted?: boolean;
  onCheckedChange: (checked: boolean) => void;
  hoverClassName?: string;
}

/**
 * The synthetic `COUNT(DISTINCT <primary key>)` row, shared by the main Data Mart and every joined
 * source so two adjacent rows can never behave differently. When the source cannot offer the
 * metric the row stays visible and explains why: the person editing a report is usually not the
 * one who can set a primary key, and hiding the row removes the only signal that would tell them
 * to ask. A row that is checked but not emitted is explained the same way, and stays clickable —
 * clearing it is the only way out of a selection the query silently drops.
 */
export function UniqueCountRow({
  label,
  description,
  dataMartName,
  state,
  checked,
  isEmitted = true,
  onCheckedChange,
  hoverClassName = 'hover:bg-muted/50',
}: UniqueCountRowProps) {
  const noteId = useId();
  // 'unknown' (and an absent state) gets no hint: the client cannot say why a state it does not
  // recognise would block the metric, and inventing one ("no primary key") is a lie the user would
  // act on.
  const availability = state?.availability;
  const hint =
    availability === undefined || availability === 'available' || availability === 'unknown'
      ? undefined
      : uniqueCountHint(availability, dataMartName);
  const notEmitted = checked && !isEmitted;
  const unverified = checked && isEmitted && availability === 'unknown';
  const note = hint ?? (notEmitted ? NOT_EMITTED_NOTE : unverified ? UNVERIFIED_NOTE : undefined);
  // Every row's visible label is the bare `Unique Count`; only the group heading above it says
  // which Data Mart. A heading is not part of a checkbox's accessible name, so without this every
  // Unique Count in the picker announces identically and none can be told from the others.
  const accessibleLabel = dataMartName?.trim() ? `${label} (${dataMartName.trim()})` : label;
  // The ⓘ tooltip opens on pointer only, so this is the description's only route to a screen
  // reader. Both parts when both apply: the note says the metric is not being generated, the
  // description says what it would count.
  const describedText = [note, description].filter(Boolean).join('\n') || undefined;
  // The wrapper is what carries the row's hook for the icon; FieldInfoTooltip itself renders
  // nothing at all without text, so the whole affordance is absent rather than empty.
  const info = description ? (
    <span data-slot='unique-count-info' className='flex shrink-0'>
      <FieldInfoTooltip text={description} compact />
    </span>
  ) : null;

  const checkbox = (
    <Checkbox
      checked={checked}
      // What the ui-kit Checkbox itself renders behind `disabled:` — the attribute this row
      // cannot use, so an aria-disabled control would otherwise look fully interactive.
      className={cn(hint && 'cursor-not-allowed opacity-50')}
      // The name comes from here, not the wrapping label: the hint below must stay OUT of the
      // accessible name (it is the description) and some ATs compute the name from the subtree.
      aria-label={accessibleLabel}
      // `aria-disabled`, never the `disabled` attribute: a disabled control drops out of the tab
      // order, so the hint explaining WHY would never reach keyboard or screen-reader users.
      aria-disabled={hint ? true : undefined}
      aria-describedby={describedText ? noteId : undefined}
      onCheckedChange={c => {
        if (hint) return;
        onCheckedChange(c === true);
      }}
    />
  );

  return (
    <>
      <div
        data-slot='unique-count-row'
        className={cn(
          'group/row flex min-w-0 items-center gap-2 rounded px-1 py-1',
          hoverClassName
        )}
      >
        {note ? (
          <>
            {checkbox}
            <Tooltip>
              {/* A focusable trigger, so the tooltip opens on keyboard focus too — a sighted
                  keyboard-only user never hears the aria-describedby text.

                  Deliberately NOT inside a <label>: a label may own one labelable control, and the
                  checkbox is already it. */}
              <TooltipTrigger
                type='button'
                className={notEmitted ? NOT_EMITTED_TRIGGER_CLASS : TRIGGER_CLASS}
                // With no hint the row is still interactive, so its text must toggle the checkbox
                // exactly as the <label> below does — clearing a stale selection is the whole
                // reason a not-emitted row stays clickable.
                {...(hint
                  ? {}
                  : {
                      onClick: () => {
                        onCheckedChange(!checked);
                      },
                    })}
              >
                {label}
              </TooltipTrigger>
              <TooltipContent side='top' className='max-w-xs whitespace-pre-line'>
                {note}
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          <label className='flex min-w-0 flex-1 cursor-pointer items-center gap-2'>
            {checkbox}
            <span className='min-w-0 truncate font-mono text-xs'>{label}</span>
          </label>
        )}
        {/* Outside the <label> above: a <span> is not interactive content, so inside it every
            click on the badge would reach the checkbox and toggle the row.

            The slot is rendered whether or not the row is checked, and holds its 24px box either
            way: the badge is taller than the row's text, so revealing it with the tick used to
            grow the row from 24px to 32px and shift everything below it. */}
        <span className='ml-auto flex items-center'>
          {info && <span className='h-6 w-6' aria-hidden='true' />}
          <span className='flex h-6 w-6 items-center justify-center rounded'>
            {checked &&
              (notEmitted ? (
                <span className='text-destructive flex items-center'>
                  <TriangleAlert className='h-4 w-4' aria-hidden='true' />
                </span>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        'flex cursor-default items-center',
                        unverified ? 'text-muted-foreground' : 'text-blue-500'
                      )}
                    >
                      <Sigma className='h-4 w-4' />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side='top' className='max-w-xs'>
                    {unverified
                      ? 'Auto-generated column — unconfirmed, see the note on the row.'
                      : 'Auto-generated column — counts the distinct values of the primary key.'}
                  </TooltipContent>
                </Tooltip>
              ))}
          </span>
          {info}
        </span>
      </div>
      {/* Outside the row on purpose: inside a <label> it would be read a second time as part of
          the checkbox's accessible name. */}
      {describedText && (
        <span id={noteId} className='sr-only whitespace-pre-line'>
          {describedText}
        </span>
      )}
    </>
  );
}
