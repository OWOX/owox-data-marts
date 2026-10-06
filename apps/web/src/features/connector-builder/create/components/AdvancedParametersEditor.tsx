import type { ReactNode } from 'react';
import { Input } from '@owox/ui/components/input';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Settings2 } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../shared/components/CollapsibleCard';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import type { ManifestParameter } from '../../shared/model/manifest.types';
import { FieldInfo } from './fields';

const REIMPORT = 'ReimportLookbackWindow';
const CREATE_EMPTY = 'CreateEmptyTables';

/**
 * The engine walks the lookback window ONE DAY AT A TIME on a time-series node
 * (`AbstractConnector._applyLookbackWindow` just subtracts the days, and every day is then
 * a separate pass over the API), so the value is a request multiplier, not a preference.
 * Half a year is already generous for a re-import; past that it is a typo that costs a
 * quota. Enforced by clamping the written value, because a bare `max` on a number input
 * only fails form validation — it does not stop the keystroke.
 *
 * A soft cap by design: it guards the form. Code mode and MCP write the manifest directly
 * and are not bound by it — the engine itself has no limit.
 */
const REIMPORT_MAX_DAYS = 180;

/** Whole days only, never negative, never past the cap. */
function clampLookbackDays(days: number): number {
  if (!Number.isFinite(days)) return 0;
  return Math.min(Math.max(Math.trunc(days), 0), REIMPORT_MAX_DAYS);
}

/**
 * One engine-managed setting: name and description on the left, control on the right.
 *
 * A `<label>` rather than a `<div>`, so the description is part of the control's hit area —
 * a checkbox with a one-line explanation next to it is a much easier target than the box.
 * The controls keep their own `aria-label`, which takes precedence over this element's text,
 * so the accessible name stays the parameter's name rather than the whole sentence.
 */
function SettingRow({
  title,
  hint,
  description,
  children,
}: {
  title: string;
  hint: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <label className='flex items-center justify-between gap-8 py-2.5'>
      <span className='min-w-0'>
        <span className='text-foreground flex items-center gap-1.5 text-[13px]'>
          {title}
          <FieldInfo hint={hint} />
        </span>
        <span className='text-muted-foreground mt-0.5 block text-[11.5px] leading-snug'>
          {description}
        </span>
      </span>
      {/* Fixed width, left-aligned: it puts every control's leading edge on the same x.
          Right-aligning them instead lines up the checkbox with the "days" suffix rather
          than with the number field, which reads as a misalignment. */}
      <span className='flex w-[120px] shrink-0 items-center gap-2'>{children}</span>
    </label>
  );
}

/**
 * The engine auto-injects `ReimportLookbackWindow` (default 2) and `CreateEmptyTables`
 * (default true) into every declarative manifest at parse time (see `ManifestParser.js`'s
 * `if (!parameters[NAME])` guard), so a connector that never mentions either one still
 * gets the same runtime behaviour as the bundled connectors. This card just makes the two
 * visible and editable here: reading falls back to the engine's own defaults, and editing
 * writes the FULL param object (label, description, requiredType, `[ADVANCED]`) back into
 * the manifest so it stays self-documenting — the parser's guard then leaves it untouched
 * because the name is already present.
 */
export function AdvancedParametersEditor() {
  const { manifest, setPath } = useBuilder();
  // `manifest.parameters` is declared as a total `Record`, but authors routinely never set
  // either name — widen locally so reading a missing key is `undefined`, not a lie.
  const params: Partial<Record<string, ManifestParameter>> = manifest.parameters;
  const reimport = (params[REIMPORT]?.default as number | undefined) ?? 2;
  const createEmpty = (params[CREATE_EMPTY]?.default as boolean | undefined) ?? true;

  const setReimport = (raw: string) => {
    const n = raw.trim() === '' ? 0 : Number(raw);
    setPath(['parameters', REIMPORT], {
      requiredType: 'number',
      isRequired: true,
      default: clampLookbackDays(n),
      label: 'Reimport Lookback Window',
      description: 'Number of days to look back when reimporting data',
      attributes: ['ADVANCED'],
    });
  };

  const setCreateEmpty = (checked: boolean) => {
    setPath(['parameters', CREATE_EMPTY], {
      requiredType: 'boolean',
      default: checked,
      label: 'Create Empty Tables',
      description: 'Create tables with all columns even if no data is returned from API',
      attributes: ['ADVANCED'],
    });
  };

  return (
    <div data-testid='advanced-parameters-editor'>
      <CollapsibleCard collapsible name='connector-advanced-parameters'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={Settings2}
            tooltip='The engine injects these for every connector at parse time. Edit them here so the manifest stays self-documenting.'
          >
            Advanced Parameters
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          {/* Both parameters are one settings row apiece, built the same way: name and its
              own sentence on the left, control on the right. They used to be two halves of
              a grid, which gave a three-digit number field a third of the screen and left
              the checkbox stranded under a label that read like an empty column's heading.
              Capped width keeps the control beside its name instead of a card's width away. */}
          <div className='divide-border/70 flex max-w-2xl flex-col divide-y'>
            <SettingRow
              title='Reimport Lookback Window'
              hint='Number of days to look back when reimporting data. Written to parameters.ReimportLookbackWindow.'
              description={`How far back to re-read on every run. Each day is a separate pass over the API, up to ${String(REIMPORT_MAX_DAYS)}.`}
            >
              <Input
                type='number'
                min={0}
                max={REIMPORT_MAX_DAYS}
                step={1}
                aria-label='Reimport Lookback Window'
                value={reimport}
                onChange={e => {
                  setReimport(e.target.value);
                }}
                className='h-[34px] w-[74px]'
              />
              <span className='text-muted-foreground text-[12px]'>days</span>
            </SettingRow>
            <SettingRow
              title='Create Empty Tables'
              hint='Create tables with all columns even if no data is returned from the API. Written to parameters.CreateEmptyTables.'
              description='Create the destination table with all its columns even when the API returns no rows.'
            >
              <Checkbox
                checked={createEmpty}
                onCheckedChange={c => {
                  setCreateEmpty(c === true);
                }}
                aria-label='Create Empty Tables'
              />
            </SettingRow>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>
    </div>
  );
}
